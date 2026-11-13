// Stands in for the Chrome extension APIs so the real panel runs on a plain web page.
// storage.local lives in memory (a reload starts fresh); runtime messages are answered with demo-data.js.
(() => {
  // Transcript totals the demo starts with: 173.250 grade points over 45.000 graded units = a 3.85 GPA.
  // Previous demo scores make upward and downward grade changes visible.
  const store = { cc_prev: { '201': 92.1, '202': 92.6, '203': 94.0, '204': 91.8, '205': 93.1 }, cc_gpa: { 'gpa-honor-pts': '173.250', 'gpa-graded-units': '45.000', 'gpa-goal-input': '3.85' } };
  const listeners = [];
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  const storage = {
    get(keys, cb) {
      const out = {};
      const list = keys == null ? Object.keys(store) : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      list.forEach((k) => {
        if (k in store) out[k] = clone(store[k]);
        else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[k] = keys[k];
      });
      if (cb) { setTimeout(() => cb(out), 0); return undefined; }
      return Promise.resolve(out);
    },
    set(items, cb) {
      const changes = {};
      Object.keys(items).forEach((k) => {
        // Keep the demo comparison snapshot stable across refreshes.
        if(k==='cc_prev') return;
        changes[k] = { oldValue: clone(store[k]), newValue: clone(items[k]) };
        store[k] = clone(items[k]);
      });
      setTimeout(() => {
        listeners.forEach((fn) => fn(changes, 'local'));
        if (cb) cb();
      }, 0);
      return cb ? undefined : Promise.resolve();
    },
  };

  const respond = (msg) => {
    switch (msg && msg.type) {
      case 'GET_CANVAS_DATA': return { ok: true, stale: false, data: window.DEMO_CANVAS_PAYLOAD };
      case 'SET_PLANNER_COMPLETE': return { ok: true, overrideId: null };
      default: return { ok: true };
    }
  };

  window.chrome = {
    storage: { local: storage, onChanged: { addListener: (fn) => listeners.push(fn) } },
    runtime: {
      lastError: undefined,
      getURL: (p) => p,
      sendMessage(msg, cb) {
        const reply = respond(msg);
        if (cb) setTimeout(() => cb(reply), 180);
      },
    },
  };

  // This is a demo: links to Canvas pages do nothing instead of navigating the visitor away.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a) e.preventDefault();
  }, true);
})();
