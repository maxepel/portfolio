// Fake Canvas data for the demo, in the same shape bg.js builds from the real Canvas API.
// Dates are relative to today so the current week always has work in it.
// The demo always opens on the same day (a Sunday evening), so every due date and label reads the same on every visit
// and nothing is ever overdue. Only `new Date()` with no arguments is frozen; Date.now() keeps real time for timers.
(() => {
  const RealDate = Date, DEMO_NOW = new RealDate(2026, 10, 8, 20, 0, 0).getTime();
  class DemoDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(DEMO_NOW); }
  }
  window.Date = DemoDate;
})();
(() => {
  const DAY = 86400000;
  const now = new Date();
  const todayDow = now.getDay();

  // Local Arizona-style timestamp, N days from today at hour h.
  const at = (days, h = 23, m = 59) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m, 0);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00-07:00`;
  };
  // A day inside the current Sunday-start week that is never in the future, so graded work shows on the trend chart.
  const inWeek = (k) => at(-(todayDow - Math.min(k, todayDow)), 14, 30);

  let nextId = 9000;
  const id = () => ++nextId;

  const graded = (name, due, pts, score, mean, when) => ({
    id: id(), name, due_at: due, points_possible: pts, published: true, omit_from_final_grade: false,
    submission: { score, workflow_state: 'graded', graded_at: when || due, submitted_at: when || due },
    score_statistics: { mean },
  });
  const open = (name, due, pts) => ({
    id: id(), name, due_at: due, points_possible: pts, published: true, omit_from_final_grade: false,
    submission: null, score_statistics: null,
  });
  const group = (name, weight, assignments, rules = {}) => ({
    id: id(), name, group_weight: weight,
    rules: { drop_lowest: rules.drop_lowest || 0, drop_highest: 0, never_drop: [] }, assignments,
  });

  const table = (head, rows) =>
    `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const SCALE = table(['Grade', 'Percentage'], [['A', '93-100%'], ['A-', '90-92%'], ['B+', '87-89%'], ['B', '83-86%'], ['B-', '80-82%'], ['C', '70-79%'], ['D', '60-69%'], ['E', 'Below 60%']]);
  const weights = (rows) => table(['Category', 'Weight'], rows);

  // Days are placed against the current Sunday-start week, so this week always holds the same mix of done and open work
  // whatever day the demo is opened. wk(k) is the k-th day of this week, prev(n) is before it, nxt(n) is after it.
  const wk = (k) => at(k - todayDow);
  const prev = (n) => at(-todayDow - n);
  const nxt = (n) => at(7 - todayDow + n);

  const courses = [
    // This week: 4 of 5 done (80%).
    { id: 201, name: 'Design Systems Studio', course_code: 'DSN 420', color: '#8C1D40', score: 95.1, label: 'A',
      syllabus: `<h3>Grading</h3>${weights([['Studio projects', '50%'], ['Critiques', '20%'], ['Quizzes', '15%'], ['Final portfolio', '15%']])}<p>The lowest quiz score will be dropped.</p><h3>Scale</h3>${SCALE}`,
      groups: [
        group('Studio projects', 50, [graded('Type specimen', prev(9), 100, 95, 84), graded('Token audit', wk(0), 100, 96, 85, inWeek(0)), graded('Component library v1', wk(3), 100, 94, 82, inWeek(1)), open('Component library v2', wk(5), 100)]),
        group('Critiques', 20, [graded('Crit 1', prev(10), 20, 19, 16), graded('Crit 2', wk(2), 20, 19, 16, inWeek(2)), open('Crit 3', nxt(2), 20)]),
        group('Quizzes', 15, [graded('Quiz 1', prev(12), 20, 19, 15), graded('Quiz 2', prev(5), 20, 19, 16), graded('Quiz 3', wk(1), 20, 18, 15, inWeek(3)), open('Quiz 4', nxt(3), 20)], { drop_lowest: 1 }),
        group('Final portfolio', 15, [open('Final portfolio', nxt(6), 100)]),
      ] },
    // This week: 3 of 4 done (75%).
    { id: 202, name: 'User Research Methods', course_code: 'UXR 440', color: '#2F5FD0', score: 91.4, label: 'A-',
      syllabus: `<h3>Grading</h3>${weights([['Research plan', '25%'], ['Interviews and synthesis', '35%'], ['Weekly reflections', '15%'], ['Final report', '25%']])}<h3>Scale</h3>${SCALE}`,
      groups: [
        group('Research plan', 25, [graded('Plan draft', prev(8), 50, 46, 40), graded('Plan final', wk(1), 50, 46, 41, inWeek(2))]),
        group('Interviews and synthesis', 35, [graded('Interview round 1', wk(3), 100, 91, 80, inWeek(3)), open('Affinity map', wk(5), 100), open('Interview round 2', nxt(2), 100)]),
        group('Weekly reflections', 15, [graded('Reflection 5', prev(6), 10, 9, 8), graded('Reflection 6', wk(2), 10, 8, 8, inWeek(3)), open('Reflection 7', nxt(1), 10)], { drop_lowest: 1 }),
        group('Final report', 25, [open('Final report', nxt(7), 100)]),
      ] },
    // This week: 2 of 3 done (67%).
    { id: 203, name: 'Interaction Design', course_code: 'IXD 450', color: '#1F9D6B', score: 95.2, label: 'A',
      syllabus: `<h3>Grading</h3>${weights([['Prototypes', '45%'], ['Usability tests', '30%'], ['Participation', '10%'], ['Capstone', '15%']])}<h3>Scale</h3>${SCALE}`,
      groups: [
        group('Prototypes', 45, [graded('Paper prototype', prev(10), 100, 97, 88), graded('Clickable prototype', wk(1), 100, 95, 86, inWeek(1)), open('Motion prototype', wk(4), 100)]),
        group('Usability tests', 30, [graded('Test plan', prev(9), 50, 48, 42), graded('Test report 1', wk(2), 50, 47, 41, inWeek(2)), open('Test report 2', nxt(1), 50)]),
        group('Participation', 10, [graded('In-class labs', prev(3), 30, 29, 25)]),
        group('Capstone', 15, [open('Capstone pitch', nxt(5), 100)]),
      ] },
    // This week: 1 of 2 done (50%).
    { id: 204, name: 'AI Experience Design', course_code: 'AIX 460', color: '#7041D6', score: 90.6, label: 'A-',
      syllabus: `<h3>Grading</h3>${weights([['Case studies', '30%'], ['Prototype sprints', '40%'], ['Quizzes', '10%'], ['Final project', '20%']])}<p>The lowest quiz score will be dropped.</p><h3>Scale</h3>${SCALE}`,
      groups: [
        group('Case studies', 30, [graded('Case study 1', prev(8), 50, 45, 40, inWeek(0)), graded('Case study 2', prev(3), 50, 46, 40, inWeek(1)), open('Case study 3', wk(4), 50)]),
        group('Prototype sprints', 40, [graded('Sprint 1', prev(9), 100, 90, 80), graded('Sprint 2', wk(2), 100, 91, 79, inWeek(3)), open('Sprint 3', nxt(2), 100)]),
        group('Quizzes', 10, [graded('Quiz 1', prev(7), 20, 18, 15), graded('Quiz 2', prev(2), 20, 13, 14), open('Quiz 3', nxt(4), 20)], { drop_lowest: 1 }),
        group('Final project', 20, [open('Final project', nxt(6), 100)]),
      ] },
    // This week: 1 of 4 done (25%).
    { id: 205, name: 'Human-Centered AI', course_code: 'HCA 480', color: '#C2661F', score: 94.3, label: 'A',
      syllabus: `<h3>Grading</h3>${weights([['Readings', '20%'], ['Ethics brief', '30%'], ['Studio critique', '20%'], ['Final project', '30%']])}<h3>Scale</h3>${SCALE}`,
      groups: [
        group('Readings', 20, [graded('Reading response 1', wk(1), 20, 19, 16, inWeek(1)), open('Reading response 2', wk(5), 20)]),
        group('Ethics brief', 30, [graded('Ethics outline', prev(6), 50, 47, 42), open('Ethics brief draft', wk(3), 100)]),
        group('Studio critique', 20, [open('Critique round', wk(6), 50)]),
        group('Final project', 30, [open('Final project', nxt(6), 100)]),
      ] },
  ];

  // Extra graded work makes the rising/falling demo trends easy to see.
  const trendExamples = {
    201: ['Component refinement', 'Design system review'],
    202: ['Interview analysis', 'Research synthesis review'],
    204: ['AI interaction critique', 'Experience evaluation'],
  };
  courses.forEach(course=>{
    (trendExamples[course.id]||[]).forEach((name,index)=>{
      course.groups[0].assignments.push(graded(name, inWeek(index+1), 100, course.score, 85, inWeek(index+1)));
    });
  });

  // Planner items: what the Assignments tab and the weekly progress rings read.
  const typeOf = (name) => (/^Quiz/.test(name) ? 'quiz' : /^(Reflection|Reading)/.test(name) ? 'discussion_topic' : 'assignment');
  const plannerItems = [];
  courses.forEach((c) => c.groups.forEach((g) => g.assignments.forEach((a) => {
    const isDone = !!a.submission; // handed in (graded or not yet graded)
    plannerItems.push({
      course_id: c.id, plannable_id: a.id, plannable_type: typeOf(a.name), plannable_date: a.due_at,
      submissions: { submitted: isDone, graded: !!(a.submission && a.submission.score != null), missing: false, late: false },
      planner_override: null,
      plannable: { title: a.name, due_at: a.due_at, points_possible: a.points_possible, html_url: `https://canvas.example.edu/courses/${c.id}/assignments/${a.id}` },
    });
  })));

  // Match the demo's recent assignment scores to the direction beside each grade.
  const previousScores = { 201:92.1, 202:92.6, 203:94.0, 204:91.8, 205:93.1 };
  courses.forEach(course=>{
    const recent=course.groups.flatMap(group=>group.assignments)
      .filter(a=>a.submission&&a.submission.submitted_at>=at(-todayDow,0,0))
      .sort((a,b)=>a.submission.submitted_at.localeCompare(b.submission.submitted_at)||a.id-b.id);
    recent.forEach((assignment,index)=>{
      const progress=recent.length>1?index/(recent.length-1):1;
      const score=previousScores[course.id]+(course.score-previousScores[course.id])*progress;
      assignment.submission.score=Number((assignment.points_possible*score/100).toFixed(3));
    });
  });

  const enrollmentMap = {}, canvasColors = {}, dashboardPositions = {}, assignmentGroupsByCourse = {};
  courses.forEach((c, i) => {
    enrollmentMap[c.id] = { course_id: c.id, type: 'StudentEnrollment', enrollment_state: 'active',
      grades: { current_score: c.score, current_grade: c.score == null ? null : c.label, final_score: null, final_grade: null } };
    canvasColors[`course_${c.id}`] = c.color;
    dashboardPositions[`course_${c.id}`] = i + 1;
    assignmentGroupsByCourse[c.id] = c.groups;
  });

  window.DEMO_CANVAS_PAYLOAD = {
    schemaVersion: 1,
    origin: 'https://canvas.example.edu',
    userId: 1,
    profile: { id: 1, name: 'Sample student', short_name: 'Sample', avatar_url: null },
    currentCourses: courses.map((c) => ({ id: c.id, name: c.name, course_code: c.course_code, enrollment_term_id: 1, workflow_state: 'available', syllabus_body: c.syllabus })),
    enrollmentMap, canvasColors, dashboardPositions, plannerItems, assignmentGroupsByCourse,
    warnings: [], fetchedAt: Date.now(),
  };
})();
