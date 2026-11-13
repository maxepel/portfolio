const { selectCurrentCourses } = typeof module !== 'undefined' && module.exports
  ? require('./course-activity.js') : CanvasCourseActivity;

// Canvas Companion — canvas-data.js
//
// This file is loaded AFTER panel.js so it can reference the state object
// and all render functions defined there.
//
// Responsibilities:
//   1. On DOMContentLoaded, request Canvas data from bg.js via sendMessage.
//   2. Map the raw API payload to the shape panel.js expects (state.courses,
//      state.assignments).
//   3. Update the student info bar (name, avatar).
//   4. Show/hide loading and error states.
//   5. Wire the Refresh and Retry buttons.
//
// Data mapping notes:
//   • Course IDs from Canvas are numbers; we store them as strings to match
//     the existing state.courses[].id convention.
//   • Canvas doesn't expose credit hours in the basic course list, so we
//     default to 3 credits per course for the GPA estimate.
//   • The GPA tab is labelled "Estimated GPA" because we convert percentage
//     scores, not official letter grades with credit-hour weighting.

'use strict';

// ── Helper: clean up Canvas course names ─────────────────────────────────────
// Canvas names often include semester suffixes like "(2026 Spring B)" or
// year-prefixes like "Fall 25 | ENG 302".  Strip those for a tidier display.
function cleanCourseName(raw) {
  return (raw || '')
    .replace(/^\d{4}\s+(Spring|Fall|Summer)\s*[A-C]?\s*\|?\s*/i, '')
    .replace(/\s*\(\d{4}\s+(?:Spring|Fall|Summer)[^)]*\)\s*$/i, '')
    .trim();
}

// ── Helper: extract short course code ────────────────────────────────────────
// course_code looks like "2026SpringB-X-SCM300-14233" → "SCM 300"
function extractCode(courseCode, fallbackName) {
  const m = (courseCode || '').match(/([A-Z]{2,4})\s*(\d{3})/);
  if (m) return `${m[1]} ${m[2]}`;
  // Fallback: try to pull "XXX 000" from the full course name
  const m2 = (fallbackName || '').match(/([A-Z]{2,4})\s*(\d{3})/);
  return m2 ? `${m2[1]} ${m2[2]}` : courseCode || '';
}

// ── Helper: simulate Canvas's per-group drop rules ────────────────────────────
// assignment_groups.rules = { drop_lowest, drop_highest, never_drop:[ids] }.
// Canvas drops the scored assignments whose removal most helps (drop_lowest)
// or most hurts (drop_highest) the category percentage. Only already-graded
// work can be dropped — ungraded assignments are the projection's "remaining
// work" and always kept. Returns { kept, dropped } over the passed array.
//
// Exact for small categories (≤12 scored candidates: brute-force the removal
// combination that optimizes earned/possible, which is what Canvas's own
// calculator optimizes); greedy by score-percentage for larger ones. The
// breakdown is a labeled estimate, so the greedy fallback is acceptable.
const DROP_EXACT_LIMIT = 12;

function isScoredSubmission(a) {
  const sub = a.submission || {};
  return sub.score != null && (sub.workflow_state === 'graded' || !!sub.graded_at);
}

// Convert Canvas ISO timestamps to the student's local calendar day so a
// late-night submission lands on the correct DD/MM tick instead of the UTC day.
function canvasDateKey(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear() + '-' +
    String(parsed.getMonth() + 1).padStart(2, '0') + '-' +
    String(parsed.getDate()).padStart(2, '0');
}

// Flatten assignment groups into chart-ready scores. A point is created only
// after Canvas reports a grade. It uses the submitted day when available and
// falls back to the due day, which keeps the weekly chart tied to work activity.
function buildGradeTrendPoints(groups) {
  if (!Array.isArray(groups)) return [];
  const points = [];

  groups.forEach((group) => {
    (group.assignments || []).forEach((assignment) => {
      if (assignment.published === false || assignment.omit_from_final_grade) return;
      if (!isScoredSubmission(assignment)) return;

      const submission = assignment.submission || {};
      const score = Number(submission.score);
      const possible = Number(assignment.points_possible);
      if (!Number.isFinite(score) || !Number.isFinite(possible) || possible <= 0) return;

      const submittedDate = canvasDateKey(submission.submitted_at);
      const dueDate = canvasDateKey(assignment.due_at);
      const date = submittedDate || dueDate;
      if (!date) return;

      points.push({
        id: String(assignment.id ?? `${date}-${assignment.name || points.length}`),
        name: assignment.name || '(Untitled)',
        date,
        dateSource: submittedDate ? 'submitted' : 'due',
        scorePct: Math.max(0, Math.min(100, (score / possible) * 100)),
        score,
        pointsPossible: possible,
      });
    });
  });

  return points.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  );
}

function combinationsOf(arr, k, start = 0, picked = [], out = []) {
  if (picked.length === k) { out.push(picked.slice()); return out; }
  for (let i = start; i <= arr.length - (k - picked.length); i++) {
    picked.push(arr[i]);
    combinationsOf(arr, k, i + 1, picked, out);
    picked.pop();
  }
  return out;
}

// Picks `count` candidates to remove. mode 'low' maximizes the kept
// earned/possible ratio (drop_lowest), 'high' minimizes it (drop_highest).
function chooseDrops(candidates, count, mode) {
  if (count <= 0 || !candidates.length) return [];
  if (count >= candidates.length) return candidates.slice();

  if (candidates.length <= DROP_EXACT_LIMIT) {
    const totalEarned   = candidates.reduce((s, a) => s + (Number(a.submission.score) || 0), 0);
    const totalPossible = candidates.reduce((s, a) => s + (Number(a.points_possible) || 0), 0);
    let best = null, bestRatio = null;
    for (const combo of combinationsOf(candidates, count)) {
      const remEarned   = combo.reduce((s, a) => s + (Number(a.submission.score) || 0), 0);
      const remPossible = combo.reduce((s, a) => s + (Number(a.points_possible) || 0), 0);
      const keptPossible = totalPossible - remPossible;
      if (keptPossible <= 0) continue;
      const ratio = (totalEarned - remEarned) / keptPossible;
      const better = bestRatio === null
        || (mode === 'low' ? ratio > bestRatio : ratio < bestRatio);
      if (better) { bestRatio = ratio; best = combo; }
    }
    if (best) return best;
  }

  // Greedy: drop the worst (or best) score-percentages.
  const pct = (a) => (Number(a.submission.score) || 0) / (Number(a.points_possible) || 1);
  return candidates.slice()
    .sort((a, b) => (mode === 'low' ? pct(a) - pct(b) : pct(b) - pct(a)))
    .slice(0, count);
}

function applyDropRules(asgns, rules) {
  const dropLow  = (rules && rules.drop_lowest)  || 0;
  const dropHigh = (rules && rules.drop_highest) || 0;
  if (!dropLow && !dropHigh) return { kept: asgns, dropped: [] };

  const neverDrop = new Set(rules.never_drop || []);
  let candidates = asgns.filter((a) =>
    isScoredSubmission(a) && !neverDrop.has(a.id) && (Number(a.points_possible) || 0) > 0);

  // Canvas never empties a category via drop rules — keep at least one score.
  const maxDroppable = Math.max(candidates.length - 1, 0);
  let low  = Math.min(dropLow,  maxDroppable);
  let high = Math.min(dropHigh, Math.max(maxDroppable - low, 0));

  const droppedLow = chooseDrops(candidates, low, 'low');
  candidates = candidates.filter((a) => !droppedLow.includes(a));
  const droppedHigh = chooseDrops(candidates, high, 'high');

  const dropped = [...droppedLow, ...droppedHigh];
  const droppedSet = new Set(dropped);
  return { kept: asgns.filter((a) => !droppedSet.has(a)), dropped };
}

// ── Helper: weighted grade-category breakdown from assignment_groups ──────────
// Produces { weighted, categories[], computedGrade, projA, projB, pointsRemaining,
// pointsPossible }. The projection model expresses the final course % as a linear
// function of the fraction `f` you earn on remaining work: final = projA + f*projB,
// where projA is your grade if you score 0 on everything left and projA+projB is
// the max still attainable. panel.js uses these to answer "what do I need?".
function computeBreakdown(groups) {
  if (!Array.isArray(groups) || !groups.length) return null;

  const anyWeight = groups.some((g) => (g.group_weight || 0) > 0);
  const categories = [];
  let gradedNumer = 0, gradedDenom = 0;   // current weighted grade (graded only)
  let A = 0, B = 0, W = 0;                 // projection coefficients
  let totalPossible = 0, gradedPossible = 0;

  groups.forEach((g) => {
    const eligible = (g.assignments || []).filter((a) =>
      a.published !== false && !a.omit_from_final_grade);

    // Honor Canvas's drop_lowest/drop_highest/never_drop rules — dropped
    // assignments are excluded from every figure below (your %, weighted
    // grade, projection, remaining points), matching Canvas's own math.
    const { kept: asgns, dropped } = applyDropRules(eligible, g.rules);

    let possible = 0, earned = 0, catGraded = 0;
    let meanNumer = 0, meanDenom = 0;       // class-average accumulation (points)

    asgns.forEach((a) => {
      const pts = Number(a.points_possible) || 0;
      if (pts <= 0) return;
      possible += pts;

      if (isScoredSubmission(a)) {
        earned += Number(a.submission.score) || 0;
        catGraded += pts;
      }

      const st = a.score_statistics;
      if (st && typeof st.mean === 'number') { meanNumer += st.mean; meanDenom += pts; }
    });

    if (possible <= 0) return;
    const w = anyWeight ? (g.group_weight || 0) : possible;
    if (w <= 0) return;

    if (catGraded > 0) { gradedNumer += w * (earned / catGraded); gradedDenom += w; }
    A += w * (earned / possible);
    B += w * ((possible - catGraded) / possible);
    W += w;
    totalPossible  += possible;
    gradedPossible += catGraded;

    categories.push({
      name:      g.name || 'Category',
      weightRaw: w,
      yourPct:   catGraded > 0 ? (earned / catGraded) * 100 : null,
      classMean: meanDenom > 0 ? (meanNumer / meanDenom) * 100 : null,
      droppedAssignments: dropped.map((a) => ({ id: a.id, name: a.name || 'Assignment' })),
    });
  });

  if (!categories.length || W <= 0) return null;

  // Normalize display weights to ~100% for the points-based (unweighted) model
  categories.forEach((c) => {
    c.weightPct = anyWeight ? c.weightRaw : (c.weightRaw / totalPossible) * 100;
    delete c.weightRaw;
  });

  return {
    weighted:       anyWeight,
    categories,
    computedGrade:  gradedDenom > 0 ? (gradedNumer / gradedDenom) * 100 : null,
    projA:          (A / W) * 100,
    projB:          (B / W) * 100,
    pointsRemaining: Math.round(totalPossible - gradedPossible),
    pointsPossible:  Math.round(totalPossible),
  };
}

// The planner API also returns announcements, calendar events, planner notes,
// etc. — only actual coursework belongs in the assignments list. (Pinned
// course announcements are often titled with the course's own name, which
// otherwise shows up looking like a duplicate assignment.)
const PLANNER_ASSIGNMENT_TYPES = new Set([
  'assignment', 'quiz', 'discussion_topic', 'wiki_page',
]);
function isAssignmentPlannerItem(type) {
  return PLANNER_ASSIGNMENT_TYPES.has(type);
}

// ═════════════════════════════════════════════════════════════════════════════
// UI STATE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function showLoading() {
  const lo = document.getElementById('cc-loading');
  const er = document.getElementById('cc-error');
  const bo = document.getElementById('body');
  if (lo) lo.style.display = 'flex';
  if (er) er.style.display = 'none';
  // Hide main panels while loading so the spinner is the only thing visible
  if (bo) bo.querySelectorAll('.panel').forEach((p) => (p.style.visibility = 'hidden'));
}

function hideLoading() {
  const lo = document.getElementById('cc-loading');
  const bo = document.getElementById('body');
  if (lo) lo.style.display = 'none';
  if (bo) bo.querySelectorAll('.panel').forEach((p) => (p.style.visibility = ''));
}

// Hides the loading spinner only — keeps main panels hidden so an error never
// reveals stale/placeholder content behind the error banner.
function hideSpinnerOnly() {
  const lo = document.getElementById('cc-loading');
  if (lo) lo.style.display = 'none';
}

function showError(message, detail) {
  hideSpinnerOnly();
  const er  = document.getElementById('cc-error');
  const msg = document.getElementById('cc-error-msg');
  const det = document.getElementById('cc-error-detail');
  if (er)  er.style.display  = 'block';
  if (msg) msg.textContent   = message || 'Could not load Canvas data';
  if (det) det.textContent   = detail  || '';
}

function hideError() {
  const er = document.getElementById('cc-error');
  if (er) er.style.display = 'none';
}

// ═════════════════════════════════════════════════════════════════════════════
// STUDENT INFO BAR
// ═════════════════════════════════════════════════════════════════════════════

function renderStudentBar(profile) {
  if (!profile) return;

  const bar    = document.getElementById('cc-student-bar');
  const avatar = document.getElementById('cc-avatar');
  const name   = document.getElementById('cc-student-name');

  if (name) name.textContent = profile.name || profile.login_id || 'Student';

  if (avatar && profile.avatar_url) {
    // Some Canvas instances return a placeholder SVG URL — skip those
    if (!profile.avatar_url.includes('no_pic') && !profile.avatar_url.includes('placeholder')) {
      avatar.src = profile.avatar_url;
      avatar.style.display = 'block';
      avatar.onerror = () => { avatar.style.display = 'none'; };
    }
  }

  if (bar) bar.style.display = 'flex';
}

// ═════════════════════════════════════════════════════════════════════════════
// DATA MAPPING  (Canvas API → panel.js state shape)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Converts the raw payload from bg.js into state.courses and state.assignments.
 *
 * Edge cases handled:
 *   • currentCourses may be empty → show friendly message, don't crash
 *   • grade score may be null     → default to 0 (course still appears)
 *   • assignments may be missing  → course simply has no pending items
 */
async function applyCanvasData(data) {
  const {
    profile, currentCourses: cachedCourses = [], enrollmentMap,
    canvasColors = {}, plannerItems = [], dashboardPositions = {},
    assignmentGroupsByCourse = {}, warnings = [], origin = '',
  } = data;

  // Dedup: the same payload can arrive twice — once from the GET_CANVAS_DATA
  // response and once from the storage.onChanged listener firing on the very
  // cache write that produced it. Applying it once is enough.
  if (data.fetchedAt && data.fetchedAt === state.lastAppliedFetchedAt) return;
  state.lastAppliedFetchedAt = data.fetchedAt;

  // Base URL for building absolute links out of the iframe (e.g. assignment
  // deep links) — a root-relative href would resolve against the extension's
  // own chrome-extension:// origin instead, since panel.html is loaded via
  // chrome.runtime.getURL.
  state.origin = origin;

  // Snapshot per-course UI state before rebuilding state.courses from
  // scratch: what the user expanded/collapsed (syllabusOpen/breakdownOpen)
  // and any grade-target they typed (bdTarget) must survive both silent
  // background refreshes and the ↻ refresh button.
  const uiState = {};
  (state.courses || []).forEach((c) => {
    uiState[c.id] = {
      syllabusOpen:  c.syllabusOpen,
      breakdownOpen: c.breakdownOpen,
      bdTarget:      c.bdTarget,
      natureMaterial:c.natureMaterial,
    };
  });

  state.canvasOrigin = origin;

  // ── Load persisted user preferences ────────────────────────────────────────
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(['cc_prev','cc_colors','cc_credits','cc_done','cc_nature_materials'], resolve);
  });
  const prevGrades    = stored.cc_prev    || {};  // { [courseId]: lastScore }
  const savedColors   = stored.cc_colors  || {};  // { [courseId]: hexColor  }
  const savedCredits  = stored.cc_credits || {};  // { [courseId]: number    }
  const doneOverrides = stored.cc_done    || {};  // { [courseId:canvasId]: bool }
  const savedNatureMaterials = stored.cc_nature_materials || {};

  // Recheck even stale/legacy payloads before any course or chart is rendered.
  const currentCourses = selectCurrentCourses(cachedCourses, plannerItems, assignmentGroupsByCourse);

  // Build a set of current course IDs for quick planner item filtering
  const currentCourseIds = new Set(currentCourses.map(c => c.id));

  // ── Map courses ─────────────────────────────────────────────────────────────
  state.courses = currentCourses.map((c, i) => {
    const enroll    = enrollmentMap[c.id] || {};
    const grades    = enroll.grades || {};
    const score     = grades.current_score  ?? grades.final_score  ?? null;
    const label     = grades.current_grade  || grades.final_grade  || '—';
    const cid       = String(c.id);
    const prevScore = prevGrades[cid] ?? null;

    // Color priority: user override (cc_colors) → Canvas dashboard color → built-in palette
    const canvasColor = canvasColors[`course_${cid}`];
    const color = savedColors[cid] || canvasColor || COLORS[i % COLORS.length];

    // Auto-extracted from Canvas's own syllabus_body HTML — heuristic, local,
    // no network call (see syllabus-parser.js).
    const syllabus = parseSyllabus(c.syllabus_body);

    // When the pasted body found nothing AND it's essentially just a link to
    // an uploaded file, remember the file id — augmentSyllabusFromFile (kicked
    // off after first render) fetches and reads it locally (PDF/DOCX).
    const fileLink = !syllabus.summary ? findSyllabusFileLink(c.syllabus_body) : null;

    return {
      id:            cid,
      canvasId:      c.id,
      name:          cleanCourseName(c.name),
      code:          extractCode(c.course_code, c.name),
      credits:       savedCredits[cid] ?? 3,
      grade:         score,
      gradeLabel:    label,
      prevGrade:     prevScore,
      gradeChanged:  prevScore !== null && score !== prevScore,
      newAssignment: false,
      color,
      natureMaterial:isNatureMaterial(savedNatureMaterials[cid] === 'lavender' ? 'tulip' : savedNatureMaterials[cid])
        ? (savedNatureMaterials[cid] === 'lavender' ? 'tulip' : savedNatureMaterials[cid])
        : null,
      syllabusBody:  c.syllabus_body || null,
      rubricData:    syllabus.summary,
      customScale:   syllabus.gradingScale,
      droppedNote:   syllabus.droppedNote, // syllabus-text drop policy (info only)
      syllabusFileId:     fileLink ? fileLink.fileId : null,
      syllabusFileStatus: fileLink ? 'reading' : null, // reading|done|nothing|unreadable|failed
      syllabusOpen:  false,
      breakdown:     computeBreakdown(assignmentGroupsByCourse[c.id]),
      gradeTrend:    buildGradeTrendPoints(assignmentGroupsByCourse[c.id]),
      breakdownOpen: false,
    };
  });

  // Re-apply the snapshotted UI state onto matching course ids — courses that
  // are new this refresh simply keep the defaults above.
  state.courses.forEach((c) => {
    const prev = uiState[c.id];
    if (!prev) return;
    if (prev.syllabusOpen  !== undefined) c.syllabusOpen  = prev.syllabusOpen;
    if (prev.breakdownOpen !== undefined) c.breakdownOpen = prev.breakdownOpen;
    if (prev.bdTarget      !== undefined) c.bdTarget      = prev.bdTarget;
    const prevMaterial = prev.natureMaterial === 'lavender' ? 'tulip' : prev.natureMaterial;
    if (isNatureMaterial(prevMaterial)) c.natureMaterial = prevMaterial;
  });

  // ── Order courses to match the student's Canvas dashboard ─────────────────────
  // dashboard_positions maps "course_<id>" → position index. Courses without a
  // position sort after positioned ones, preserving their term order.
  if (dashboardPositions && Object.keys(dashboardPositions).length) {
    const posOf = (c) => {
      const p = dashboardPositions[`course_${c.id}`];
      return typeof p === 'number' ? p : Number.MAX_SAFE_INTEGER;
    };
    state.courses.sort((a, b) => posOf(a) - posOf(b));
  }
  state.courses.forEach((course,index)=>{
    course.natureMaterial=normalizeNatureMaterial(course.natureMaterial,index);
  });

  // Save current scores as "previous" — used for trend arrows next session
  const newPrev = {};
  state.courses.forEach((c) => { newPrev[c.id] = c.grade; });
  chrome.storage.local.set({ cc_prev: newPrev });

  // ── Map planner items → assignments ──────────────────────────────────────────
  // The Canvas planner API covers assignments, quizzes, discussions, and to-dos
  // in one call, and provides submission state directly on each item.
  let idx = 0;
  state.assignments = [];

  // Build a course lookup by numeric Canvas ID for O(1) access
  const courseById = {};
  state.courses.forEach(c => { courseById[c.canvasId] = c; });

  let doneOverridesDirty = false; // set when a cc_done entry is pruned below

  plannerItems.forEach((item) => {
    // Only include items belonging to classes with work in the ±14-day scan
    if (!currentCourseIds.has(item.course_id)) return;
    // Only real coursework — skip announcements, calendar events, notes, etc.
    if (!isAssignmentPlannerItem(item.plannable_type)) return;
    const course = courseById[item.course_id];
    if (!course) return;

    // Determine completion: Canvas provides a `submissions` object on each item
    // with `submitted`, `graded`, `missing`, etc. Also respect manual overrides.
    const sub  = item.submissions || {};
    let done = !!(sub.submitted || sub.graded ||
                  item.planner_override?.marked_complete);

    // Apply the user's manual check/uncheck (cc_done, written by panel.js's
    // saveAssignmentDone). An override wins until Canvas's own state catches
    // up with it, at which point it's pruned so it can't go stale.
    const doneKey = course.id + ':' + item.plannable_id;
    if (Object.prototype.hasOwnProperty.call(doneOverrides, doneKey)) {
      if (doneOverrides[doneKey] === done) {
        delete doneOverrides[doneKey];
        doneOverridesDirty = true;
      } else {
        done = doneOverrides[doneKey];
      }
    }

    const dueRaw = item.plannable_date || item.plannable?.due_at || null;
    // Skip items with no due date that aren't done — nothing useful to show
    if (!dueRaw && !done) return;

    // Friendly type label for display (quiz, discussion, etc.)
    const typeLabel = item.plannable_type === 'assignment'       ? null
                    : item.plannable_type === 'quiz'             ? 'Quiz'
                    : item.plannable_type === 'discussion_topic' ? 'Discussion'
                    : item.plannable_type === 'wiki_page'        ? 'Page'
                    : null;

    state.assignments.push({
      id:            `a${idx++}`,
      canvasId:      item.plannable_id,
      name:          item.plannable?.title || item.plannable?.name || '(Untitled)',
      courseId:      course.id,
      due:           dueRaw ? dueRaw.split('T')[0] : null,
      done,
      typeLabel,
      // Raw planner identity — needed to write marked_complete back to Canvas
      plannableType: item.plannable_type,
      overrideId:    item.planner_override?.id ?? null,
    });
  });

  // Write back cc_done only if pruning removed satisfied overrides above
  if (doneOverridesDirty) chrome.storage.local.set({ cc_done: doneOverrides });

  // ── Re-render everything with real data ──────────────────────────────────────
  hideLoading();
  hideError();
  renderStudentBar(profile);
  renderPartialNotice(warnings);
  renderHero();
  renderAssignments();
  renderGrades();
  updateAsgnNotifDots();
  updateGradeNotifDots();
  if (typeof recalcAll === 'function') recalcAll();

  // After the first render (so the "Reading syllabus file…" state is visible),
  // kick off file-based syllabus extraction for courses that need it. Fire and
  // forget — each call re-renders on completion and handles its own errors.
  state.courses.forEach((c) => {
    if (c.syllabusFileId && !c.rubricData) augmentSyllabusFromFile(c);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// FILE-BASED SYLLABUS EXTRACTION  (PDF/DOCX — local, no AI API)
// ═════════════════════════════════════════════════════════════════════════════

// Fetches the linked syllabus file's text and runs the same extraction
// heuristics on it (buildSyllabusResult). Extracted text is cached in
// chrome.storage.local (cc_syllabus_file_cache) keyed by file id and
// invalidated via the file's updated_at, so a PDF isn't re-parsed on every
// panel load. `force` (Re-analyze button) bypasses the cache.
async function augmentSyllabusFromFile(course, force) {
  const fileId = course.syllabusFileId;
  if (!fileId || !state.canvasOrigin) return;
  course.syllabusFileStatus = 'reading';

  const CACHE_KEY = 'cc_syllabus_file_cache';
  try {
    // File metadata: display name, content-type, updated_at, download URL.
    const metaRes = await fetch(`${state.canvasOrigin}/api/v1/files/${fileId}`,
      { credentials: 'include' });
    if (!metaRes.ok) throw new Error(`files API HTTP ${metaRes.status}`);
    const meta = await metaRes.json();

    const stored = await new Promise((res) => chrome.storage.local.get([CACHE_KEY], res));
    const cache = stored[CACHE_KEY] || {};

    let fileData; // { text, html } | null — "known unreadable" is cached as nulls
    const cached = cache[fileId];
    if (!force && cached && cached.fileUpdatedAt === meta.updated_at) {
      fileData = (cached.text || cached.html)
        ? { text: cached.text || null, html: cached.html || null }
        : null;
    } else {
      const dlRes = await fetch(meta.url, { credentials: 'include' });
      if (!dlRes.ok) throw new Error(`file download HTTP ${dlRes.status}`);
      const buf = await dlRes.arrayBuffer();
      fileData = await extractTextFromFile(buf, meta['content-type'], meta.display_name);

      // Prune entries for files no longer referenced by any current course,
      // then store — keeps the cache from growing across semesters.
      const liveIds = new Set(state.courses.map((x) => x.syllabusFileId).filter(Boolean));
      Object.keys(cache).forEach((k) => { if (!liveIds.has(k)) delete cache[k]; });
      cache[fileId] = {
        text: fileData ? fileData.text : null,
        html: fileData ? fileData.html : null,
        fileUpdatedAt: meta.updated_at,
      };
      chrome.storage.local.set({ [CACHE_KEY]: cache });
    }

    if (fileData) {
      // DOCX keeps its table markup — use the table-aware HTML path; PDFs
      // only have flat text.
      const result = fileData.html
        ? parseSyllabus(fileData.html)
        : buildSyllabusResult(fileData.text);
      if (result.summary) {
        course.rubricData  = result.summary;
        course.customScale = result.gradingScale;
        course.droppedNote = result.droppedNote;
        course.syllabusFileStatus = 'done';
      } else {
        course.syllabusFileStatus = 'nothing'; // readable, but no grading info found
      }
    } else {
      course.syllabusFileStatus = 'unreadable'; // scanned PDF, legacy .doc, ...
    }
  } catch (e) {
    console.warn('[CC] syllabus file fetch failed:', e);
    course.syllabusFileStatus = 'failed';
  }

  renderGrades();
  if (typeof recalcAll === 'function') recalcAll(); // customScale can shift GPA figures
}

// Show a subtle, non-blocking notice when some sections failed to load, so the
// student knows the panel is showing partial data rather than everything.
function renderPartialNotice(warnings) {
  const bar = document.getElementById('cc-student-bar');
  if (!bar) return;
  const existing = document.getElementById('cc-partial-tag');
  if (existing) existing.remove();
  if (!warnings || !warnings.length) return;

  const sections = [...new Set(warnings.map((w) => w.section))].join(', ');
  const tag = document.createElement('span');
  tag.id = 'cc-partial-tag';
  tag.textContent = 'partial data';
  tag.title = `Some Canvas data couldn't load (${sections}). Showing what's available.`;
  tag.style.cssText =
    'font-size:8px;font-weight:700;color:#FF7F32;border:1px solid #FF7F32;' +
    'border-radius:4px;padding:0 4px;margin-left:6px;cursor:help;flex-shrink:0;';
  bar.appendChild(tag);
}

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE PASSING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Asks bg.js for Canvas data.  Shows loading state while waiting.
 * On success → applyCanvasData().
 * On failure → showError().
 */
function requestCanvasData() {
  showLoading();

  let settled = false;
  const timeoutId = setTimeout(() => {
    if (!settled) {
      settled = true;
      showError('Timed out', 'Try closing and reopening the panel.');
    }
  }, 15000);

  chrome.runtime.sendMessage({ type: 'GET_CANVAS_DATA' }, (response) => {
    // Read lastError before any early return — if the 15s timeout already
    // settled this request, skipping the read makes Chrome log
    // "Unchecked runtime.lastError" to the page console.
    const err = chrome.runtime.lastError;
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);

    if (err) {
      // "Receiving end does not exist" / "context invalidated" mean the
      // extension was reloaded or the worker is gone — a page refresh
      // reconnects the panel; retrying from the old page cannot.
      const gone = /receiving end does not exist|context invalidated/i
        .test(err.message || '');
      showError(
        gone ? 'Extension was reloaded' : 'Extension error',
        gone ? 'Refresh this Canvas page to reconnect the panel.' : err.message
      );
      return;
    }

    if (!response || !response.ok) {
      const msg    = response?.message || "Couldn't reach Canvas.";
      const detail = response?.error === 'NO_CANVAS_TAB'
        ? 'Open Canvas in a tab first, then click the extension icon.'
        : response?.error === 'AUTH'
        ? 'Log in to Canvas and try again.'
        : 'Check your internet connection.';
      showError(msg, detail);
      return;
    }

    // Show a subtle indicator when displaying stale cache — removed by the
    // cc_canvas_cache storage listener once the background refresh lands.
    if (response.stale) {
      const bar = document.getElementById('cc-student-bar');
      if (bar && !document.getElementById('cc-stale-tag')) {
        const tag = document.createElement('span');
        tag.id = 'cc-stale-tag';
        tag.textContent = 'cached';
        tag.style.cssText = 'font-size:8px;color:#555;margin-left:4px';
        bar.appendChild(tag);
      }
    }

    applyCanvasData(response.data);
  });
}

/**
 * Clears the cache in bg.js then re-fetches fresh data.
 * Wired to the ↻ refresh button and the Retry button.
 */
function refreshCanvasData() {
  chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' }, () => {
    // Read lastError so a dead service worker doesn't log "Unchecked
    // runtime.lastError"; requestCanvasData surfaces the real failure.
    void chrome.runtime.lastError;
    requestCanvasData();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════════════

// Live cache updates: bg.js writes cc_canvas_cache when a background refresh
// (stale-while-revalidate or content-script prefetch) completes. Re-render in
// place — no showLoading, no spinner — the same way content.js's dark-mode
// listener silently re-applies cc2_mode changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.cc_canvas_cache) return;
  const next = changes.cc_canvas_cache.newValue;
  if (!next) return; // cache invalidated (↻ button) — the request flow handles it

  // Data is fresh now — drop the "cached" indicator if one is showing.
  const staleTag = document.getElementById('cc-stale-tag');
  if (staleTag) staleTag.remove();

  applyCanvasData(next);
});

document.addEventListener('DOMContentLoaded', () => {
  // Refresh button (↻ in the student bar)
  const refreshBtn = document.getElementById('cc-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshCanvasData);

  // Retry button (in the error state)
  const retryBtn = document.getElementById('cc-retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', refreshCanvasData);

  // Kick off the initial data load
  requestCanvasData();
});

// Node-only export for the test suite (test/canvas-data-helpers.test.js).
// `module` doesn't exist in the browser, so this is a no-op when loaded via
// <script>. applyCanvasData isn't exported — it orchestrates chrome.storage,
// rendering, and the global parseSyllabus/state that only exist when
// canvas-data.js is loaded after panel.js/syllabus-parser.js on the real
// panel page, so it's out of scope for isolated unit tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanCourseName, extractCode, computeBreakdown, applyDropRules,
    isAssignmentPlannerItem, canvasDateKey, buildGradeTrendPoints,
  };
}
