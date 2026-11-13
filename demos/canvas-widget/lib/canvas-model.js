const COURSEWORK_TYPES = new Set(['assignment', 'quiz', 'discussion_topic', 'wiki_page']);
const ARIZONA_TIME_ZONE = 'America/Phoenix';
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_COLORS = ['#8C1D40', '#4D4D4D', '#00A3E0', '#AF674B', '#747474'];
const DROP_EXACT_LIMIT = 12;
const ACTIVE_COURSE_WINDOW_DAYS = 14;

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function cleanCourseName(raw) {
  return String(raw || '')
    .replace(/^\d{4}\s+(Spring|Fall|Summer)\s*[A-C]?\s*\|?\s*/i, '')
    .replace(/\s*\(\d{4}\s+(?:Spring|Fall|Summer)[^)]*\)\s*$/i, '')
    .trim();
}

export function extractCourseCode(courseCode, fallbackName = '') {
  const match = String(courseCode || '').match(/([A-Z]{2,4})\s*-?\s*(\d{3})/i)
    || String(fallbackName || '').match(/([A-Z]{2,4})\s*(\d{3})/i);
  return match ? `${match[1].toUpperCase()} ${match[2]}` : String(courseCode || '');
}

export function sanitizeCourseColor(value, fallback = '#8C1D40') {
  const candidate = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
}

export function arizonaDateKey(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ARIZONA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function weekRange(reference = new Date(), weekStartDay = 0) {
  const key = arizonaDateKey(reference);
  if (!key) throw new Error('Invalid reference date');
  const [year, month, day] = key.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: ARIZONA_TIME_ZONE,
    weekday: 'short',
  }).format(reference);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  const offset = (weekday - weekStartDay + 7) % 7;
  const start = new Date(anchor.getTime() - offset * DAY_MS);
  const keys = Array.from({ length: 7 }, (_, index) =>
    new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10)
  );
  return { start: keys[0], end: keys[6], keys };
}

export function formatDue(value, options = {}) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ARIZONA_TIME_ZONE,
    weekday: options.weekday ? 'short' : undefined,
    month: options.date ? 'short' : undefined,
    day: options.date ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatWeekLabel(range) {
  const start = new Date(`${range.start}T12:00:00Z`);
  const end = new Date(`${range.end}T12:00:00Z`);
  const startLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(start);
  const endLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(end);
  return `${startLabel}–${endLabel}`;
}

function isScoredSubmission(assignment) {
  const submission = assignment?.submission || {};
  return submission.score != null
    && (submission.workflow_state === 'graded' || Boolean(submission.graded_at));
}

function combinationsOf(values, size, start = 0, picked = [], output = []) {
  if (picked.length === size) {
    output.push(picked.slice());
    return output;
  }
  for (let index = start; index <= values.length - (size - picked.length); index += 1) {
    picked.push(values[index]);
    combinationsOf(values, size, index + 1, picked, output);
    picked.pop();
  }
  return output;
}

function chooseDrops(candidates, count, mode) {
  if (count <= 0 || !candidates.length) return [];
  if (count >= candidates.length) return candidates.slice();
  if (candidates.length <= DROP_EXACT_LIMIT) {
    const totalEarned = candidates.reduce((sum, item) => sum + (Number(item.submission.score) || 0), 0);
    const totalPossible = candidates.reduce((sum, item) => sum + (Number(item.points_possible) || 0), 0);
    let best = null;
    let bestRatio = null;
    for (const combo of combinationsOf(candidates, count)) {
      const removedEarned = combo.reduce((sum, item) => sum + (Number(item.submission.score) || 0), 0);
      const removedPossible = combo.reduce((sum, item) => sum + (Number(item.points_possible) || 0), 0);
      const keptPossible = totalPossible - removedPossible;
      if (keptPossible <= 0) continue;
      const ratio = (totalEarned - removedEarned) / keptPossible;
      if (bestRatio === null || (mode === 'low' ? ratio > bestRatio : ratio < bestRatio)) {
        bestRatio = ratio;
        best = combo;
      }
    }
    if (best) return best;
  }
  const percent = (item) =>
    (Number(item.submission.score) || 0) / (Number(item.points_possible) || 1);
  return candidates.slice()
    .sort((a, b) => mode === 'low' ? percent(a) - percent(b) : percent(b) - percent(a))
    .slice(0, count);
}

export function applyDropRules(assignments, rules = {}) {
  const dropLow = Number(rules.drop_lowest) || 0;
  const dropHigh = Number(rules.drop_highest) || 0;
  if (!dropLow && !dropHigh) return { kept: assignments, dropped: [] };
  const neverDrop = new Set((rules.never_drop || []).map(Number));
  let candidates = assignments.filter((assignment) =>
    isScoredSubmission(assignment)
    && !neverDrop.has(Number(assignment.id))
    && (Number(assignment.points_possible) || 0) > 0
  );
  const maxDroppable = Math.max(candidates.length - 1, 0);
  const low = Math.min(dropLow, maxDroppable);
  const high = Math.min(dropHigh, Math.max(maxDroppable - low, 0));
  const droppedLow = chooseDrops(candidates, low, 'low');
  candidates = candidates.filter((assignment) => !droppedLow.includes(assignment));
  const droppedHigh = chooseDrops(candidates, high, 'high');
  const dropped = [...droppedLow, ...droppedHigh];
  const droppedSet = new Set(dropped);
  return {
    kept: assignments.filter((assignment) => !droppedSet.has(assignment)),
    dropped,
  };
}

export function computeBreakdown(groups) {
  if (!Array.isArray(groups) || !groups.length) return null;
  const weighted = groups.some((group) => (Number(group.group_weight) || 0) > 0);
  const categories = [];
  let gradedNumerator = 0;
  let gradedDenominator = 0;
  let projectionA = 0;
  let projectionB = 0;
  let weightTotal = 0;
  let totalPossible = 0;
  let gradedPossible = 0;

  for (const group of groups) {
    const eligible = (group.assignments || []).filter((assignment) =>
      assignment.published !== false && !assignment.omit_from_final_grade
    );
    const { kept, dropped } = applyDropRules(eligible, group.rules);
    let possible = 0;
    let earned = 0;
    let categoryGraded = 0;
    let classMeanNumerator = 0;
    let classMeanDenominator = 0;
    for (const assignment of kept) {
      const points = Number(assignment.points_possible) || 0;
      if (points <= 0) continue;
      possible += points;
      if (isScoredSubmission(assignment)) {
        earned += Number(assignment.submission.score) || 0;
        categoryGraded += points;
      }
      if (typeof assignment.score_statistics?.mean === 'number') {
        classMeanNumerator += assignment.score_statistics.mean;
        classMeanDenominator += points;
      }
    }
    if (possible <= 0) continue;
    const weight = weighted ? Number(group.group_weight) || 0 : possible;
    if (weight <= 0) continue;
    if (categoryGraded > 0) {
      gradedNumerator += weight * (earned / categoryGraded);
      gradedDenominator += weight;
    }
    projectionA += weight * (earned / possible);
    projectionB += weight * ((possible - categoryGraded) / possible);
    weightTotal += weight;
    totalPossible += possible;
    gradedPossible += categoryGraded;
    categories.push({
      name: group.name || 'Category',
      weightRaw: weight,
      yourPct: categoryGraded > 0 ? (earned / categoryGraded) * 100 : null,
      classMean: classMeanDenominator > 0 ? (classMeanNumerator / classMeanDenominator) * 100 : null,
      droppedAssignments: dropped.map((assignment) => ({
        id: assignment.id,
        name: assignment.name || 'Assignment',
      })),
    });
  }
  if (!categories.length || weightTotal <= 0) return null;
  for (const category of categories) {
    category.weightPct = weighted
      ? category.weightRaw
      : (category.weightRaw / totalPossible) * 100;
    delete category.weightRaw;
  }
  return {
    weighted,
    categories,
    computedGrade: gradedDenominator > 0 ? (gradedNumerator / gradedDenominator) * 100 : null,
    projA: (projectionA / weightTotal) * 100,
    projB: (projectionB / weightTotal) * 100,
    pointsRemaining: Math.round(totalPossible - gradedPossible),
    pointsPossible: Math.round(totalPossible),
  };
}

export function computeNeeded(breakdown, target) {
  if (!breakdown || !Number.isFinite(Number(target))) return null;
  const desired = Number(target);
  if (desired <= breakdown.projA) return 0;
  if (!Number.isFinite(breakdown.projB) || breakdown.projB <= 0) return null;
  return ((desired - breakdown.projA) / breakdown.projB) * 100;
}

export function buildGradeTrendPoints(groups) {
  if (!Array.isArray(groups)) return [];
  const points = [];
  for (const group of groups) {
    for (const assignment of group.assignments || []) {
      if (assignment.published === false || assignment.omit_from_final_grade) continue;
      if (!isScoredSubmission(assignment)) continue;
      const score = Number(assignment.submission.score);
      const possible = Number(assignment.points_possible);
      if (!Number.isFinite(score) || !Number.isFinite(possible) || possible <= 0) continue;
      const date = arizonaDateKey(assignment.submission.submitted_at)
        || arizonaDateKey(assignment.due_at);
      if (!date) continue;
      points.push({
        id: String(assignment.id),
        name: assignment.name || 'Assignment',
        date,
        scorePct: Math.max(0, Math.min(100, score / possible * 100)),
        score,
        pointsPossible: possible,
      });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

function absoluteCanvasUrl(origin, value) {
  if (!value) return origin;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.href : origin;
  } catch {
    return origin;
  }
}

function extractSyllabusInsight(html) {
  if (!html) return null;
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const drop = text.match(/(?:drop|drops|dropped|dropping)\s+(?:the\s+)?(?:one\s+)?lowest[^.]{0,100}/i)
    || text.match(/lowest[^.]{0,80}\s+(?:is|will be)\s+dropped/i);
  return drop ? drop[0].trim() : null;
}

function gradeValue(enrollment) {
  const grades = enrollment?.grades || {};
  const score = grades.current_score ?? grades.final_score ?? null;
  if (score === null || score === '') return null;
  return Number.isFinite(Number(score)) ? Number(score) : null;
}

export function buildCanvasModel(data, preferences = {}, now = new Date()) {
  const enrollmentMap = data.enrollmentMap || {};
  const positions = data.dashboardPositions || {};
  const courseColors = data.canvasColors || {};
  const groupsByCourse = data.assignmentGroupsByCourse || {};
  const allCourses = (data.currentCourses || []).map((course, index) => {
    const id = String(course.id);
    const enrollment = enrollmentMap[course.id] || enrollmentMap[id] || {};
    const grade = gradeValue(enrollment);
    const gradeLabel = enrollment.grades?.current_grade
      || enrollment.grades?.final_grade
      || null;
    const groups = groupsByCourse[course.id] || groupsByCourse[id] || [];
    const fallbackColor = FALLBACK_COLORS[index % FALLBACK_COLORS.length];
    const rawPosition = Number(positions[`course_${id}`]);
    return {
      id,
      canvasId: Number(course.id),
      name: cleanCourseName(course.name),
      code: extractCourseCode(course.course_code, course.name),
      grade,
      gradeLabel,
      color: sanitizeCourseColor(courseColors[`course_${id}`], fallbackColor),
      position: Number.isFinite(rawPosition)
        ? rawPosition
        : Number.MAX_SAFE_INTEGER,
      breakdown: computeBreakdown(groups),
      gradeTrend: buildGradeTrendPoints(groups),
      syllabusInsight: extractSyllabusInsight(course.syllabus_body),
      gpaEligible: grade !== null && !['P', 'F', 'PASS', 'FAIL'].includes(String(gradeLabel || '').toUpperCase()),
    };
  }).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  const courseById = new Map(allCourses.map((course) => [course.canvasId, course]));
  const plans = preferences.plans || {};
  const assignments = [];
  for (const item of data.plannerItems || []) {
    if (!COURSEWORK_TYPES.has(item.plannable_type)) continue;
    const course = courseById.get(Number(item.course_id));
    if (!course) continue;
    const dueAt = item.plannable_date || item.plannable?.due_at || null;
    if (!dueAt) continue;
    const submission = item.submissions || {};
    const done = Boolean(
      submission.submitted
      || submission.graded
      || item.planner_override?.marked_complete
    );
    const id = String(item.plannable_id);
    const planKey = `${course.id}:${id}`;
    assignments.push({
      id,
      courseId: course.id,
      canvasCourseId: course.canvasId,
      name: item.plannable?.title || 'Untitled',
      type: item.plannable_type,
      dueAt,
      dueKey: arizonaDateKey(dueAt),
      done,
      missing: Boolean(submission.missing),
      late: Boolean(submission.late),
      pointsPossible: Number.isFinite(Number(item.plannable?.points_possible))
        ? Number(item.plannable.points_possible)
        : null,
      htmlUrl: absoluteCanvasUrl(data.origin, item.plannable?.html_url),
      planKey,
      planMinutes: Number(plans[planKey]) || null,
    });
  }
  assignments.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt) || a.name.localeCompare(b.name));

  // A course with nothing due in the next ACTIVE_COURSE_WINDOW_DAYS is treated as inactive
  // (old terms stay "active" in Canvas). If nothing qualifies, keep everything rather than
  // showing an empty dashboard (e.g. planner fetch failed).
  const activeCutoff = now.getTime() + ACTIVE_COURSE_WINDOW_DAYS * 86_400_000;
  const activeCourseIds = new Set(
    assignments
      .filter((assignment) => assignment.dueKey >= arizonaDateKey(now)
        && new Date(assignment.dueAt).getTime() <= activeCutoff)
      .map((assignment) => assignment.courseId),
  );
  const courses = activeCourseIds.size
    ? allCourses.filter((course) => activeCourseIds.has(course.id))
    : allCourses;
  const visibleIds = new Set(courses.map((course) => course.id));
  for (let i = assignments.length - 1; i >= 0; i -= 1) {
    if (!visibleIds.has(assignments[i].courseId)) assignments.splice(i, 1);
  }
  const range = weekRange(now, Number(preferences.weekStartDay) || 0);
  const todayKey = arizonaDateKey(now);
  const weekAssignments = assignments.filter((assignment) =>
    assignment.dueKey >= range.start && assignment.dueKey <= range.end
  );
  const upcoming = assignments.filter((assignment) =>
    !assignment.done && new Date(assignment.dueAt).getTime() >= now.getTime()
  );
  const courseAssignmentCounts = {};
  for (const assignment of weekAssignments) {
    courseAssignmentCounts[assignment.courseId] = (courseAssignmentCounts[assignment.courseId] || 0) + 1;
  }
  for (const course of courses) {
    course.weekAssignmentCount = courseAssignmentCounts[course.id] || 0;
  }
  return {
    origin: data.origin,
    fetchedAt: data.fetchedAt,
    warnings: data.warnings || [],
    profile: data.profile || { name: 'Student' },
    courses,
    assignments,
    weekAssignments,
    weekRange: range,
    todayKey,
    todayAssignments: assignments.filter((assignment) => assignment.dueKey === todayKey),
    focusAssignment: upcoming[0] || null,
  };
}

export function percentToGpa(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value)) return null;
  if (value >= 93) return 4.0;
  if (value >= 90) return 3.67;
  if (value >= 87) return 3.33;
  if (value >= 83) return 3.0;
  if (value >= 80) return 2.67;
  if (value >= 77) return 2.33;
  if (value >= 70) return 2.0;
  if (value >= 67) return 1.33;
  if (value >= 60) return 1.0;
  return 0;
}

export function calculateGpa(courses, credits = {}) {
  let points = 0;
  let hours = 0;
  for (const course of courses || []) {
    const credit = Number(credits[course.id]);
    const gpa = percentToGpa(course.grade);
    if (!course.gpaEligible || !Number.isFinite(credit) || credit <= 0 || gpa === null) continue;
    points += gpa * credit;
    hours += credit;
  }
  return hours > 0 ? { gpa: points / hours, credits: hours } : null;
}
