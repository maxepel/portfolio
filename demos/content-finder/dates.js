// Calendar dates stay as ISO strings so searching never depends on a timezone.
(() => {
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function parse(raw) {
    let year = '', month = '', day = '';
    let text = raw.toLowerCase().replace(/\b(20\d{2})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?\b/g, (_, y, m, d) => {
      year = y; month = m; day = d || ''; return ' ';
    });
    text = text.replace(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/g, (_, m, d, y) => {
      year = y; month = m.padStart(2, '0'); day = d.padStart(2, '0'); return ' ';
    });
    text = text.replace(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b\.?/g, name => {
      month = String(months.findIndex(m => m.startsWith(name.replace('.', ''))) + 1).padStart(2, '0'); return ' ';
    });
    text = text.replace(/\b20\d{2}\b/g, y => { year = y; return ' '; });
    if (month) text = text.replace(/\b([12]?\d|3[01])(?:st|nd|rd|th)?\b/, (_, d) => { day = d.padStart(2, '0'); return ' '; });
    return { text: text.trim(), year, month, day, active: !!(year || month || day) };
  }
  function matches(date, query, from = '', through = '') {
    if (!date) return !(query.active || from || through);
    if ((from && date < from) || (through && date > through)) return false;
    const [year, month, day] = date.split('-');
    return (!query.year || query.year === year) && (!query.month || query.month === month) && (!query.day || query.day === day);
  }
  window.FINDER_DATES = { parse, matches };
})();
