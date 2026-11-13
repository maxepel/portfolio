// Shared by the service worker and panel, including stale-cache rendering.
const CanvasCourseActivity = (() => {
  // A class is current when student-visible work is due within ±14 calendar days.
  // Assignment groups include completed work; planner evidence also covers quizzes,
  // discussions, and dated pages. Term IDs are opaque identifiers, not dates.
  function selectCurrentCourses(courses, plannerItems, groupsByCourse, now = new Date()) {
    const start = new Date(now), end = new Date(now);
    start.setDate(start.getDate() - 14); start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 14); end.setHours(23, 59, 59, 999);
    const inWindow = value => {
      if (!value) return false;
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
    };
    const activeIds = new Set();
    for (const item of plannerItems || []) {
      if (['assignment', 'quiz', 'discussion_topic', 'wiki_page'].includes(item.plannable_type) &&
          inWindow(item.plannable?.due_at || item.plannable_date)) {
        activeIds.add(String(item.course_id));
      }
    }
    return courses.filter(course => activeIds.has(String(course.id)) ||
      (groupsByCourse[course.id] || []).some(group =>
        (group.assignments || []).some(a => a.published !== false &&
          a.hidden_to_user !== true && inWindow(a.due_at))));
  }

  return { selectCurrentCourses };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CanvasCourseActivity;
