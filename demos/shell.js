// Portfolio shell: timeline rail, nav highlight, iframe loading, full screen, game overlay.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.documentElement.classList.add('js');

  // Scroll reveals: description lines stagger in, then the demo.
  document.querySelectorAll('.project').forEach((p) => {
    p.querySelectorAll('.desc > *').forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--i', i); });
    const d = p.querySelector('.demo'); if (d) { d.classList.add('rv'); d.style.setProperty('--i', 2); }
  });
  const rv = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.rv').forEach((el) => rv.observe(el));

  const sections = [...document.querySelectorAll('.project')];
  const links = new Map([...document.querySelectorAll('[data-link]')].map((a) => [a.dataset.link, a]));
  const dots = new Map([...document.querySelectorAll('[data-dot]')].map((d) => [d.dataset.dot, d]));
  const rail = document.querySelector('.rail');
  const monthEl = document.querySelector('.rail-month');
  let shownMonth = '';
  let swapTimer = 0;

  // Month label: fade out the old month, then slide the new one up. No animation when reduced.
  function setMonth(text) {
    if (!monthEl || text === shownMonth) return;
    shownMonth = text;
    clearTimeout(swapTimer);
    const apply = () => {
      monthEl.textContent = text;
      monthEl.classList.remove('out', 'in');
      if (text) { void monthEl.offsetWidth; monthEl.classList.add('in'); }
      rail.classList.toggle('has-month', !!text);
    };
    if (reduced.matches || !monthEl.textContent) return apply();
    monthEl.classList.remove('in');
    monthEl.classList.add('out');
    swapTimer = setTimeout(apply, 220);
  }

  function activate(section) {
    const id = section ? section.id : '';
    links.forEach((a, key) => a.classList.toggle('is-active', key === id));
    const idx = section ? sections.indexOf(section) : -1;
    sections.forEach((s, i) => {
      const d = dots.get(s.id); if (!d) return;
      d.classList.toggle('is-active', i === idx);
      d.classList.toggle('is-past', i < idx);
    });
    const accent = section ? getComputedStyle(section).getPropertyValue('--accent').trim() : '';
    if (accent) document.documentElement.style.setProperty('--rail-accent', accent);
    else document.documentElement.style.removeProperty('--rail-accent');
    setMonth(section ? section.dataset.month : '');
  }

  // A section is "current" while it crosses the middle band of the viewport.
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    const current = sections.find((s) => visible.has(s)) || null;
    // Keep the last month while crossing the gap between sections; clear only above the first one.
    if (current) activate(current);
    else if (window.scrollY < sections[0].offsetTop - innerHeight / 2) activate(null);
  }, { rootMargin: '-45% 0px -45% 0px' });
  sections.forEach((s) => io.observe(s));

  // Dots sit where each section will be when scrolled to it, so the progress line reaches a dot as you arrive.
  const root = document.documentElement;
  const progressEl = document.querySelector('.rail-progress');
  let maxScroll = 1, progressFrame = 0;
  function layoutRail() {
    maxScroll = Math.max(1, root.scrollHeight - innerHeight);
    sections.forEach((s) => {
      const at = s.offsetTop + s.offsetHeight / 2 - innerHeight / 2;
      dots.get(s.id)?.style.setProperty('--y', (Math.min(1, Math.max(0, at / maxScroll)) * 100).toFixed(2) + '%');
    });
    updateProgress();
  }
  // Set on the line itself: a custom property on :root would restyle the whole page every scroll frame.
  function updateProgress() {
    progressFrame = 0;
    progressEl?.style.setProperty('--progress', Math.min(1, Math.max(0, scrollY / maxScroll)).toFixed(4));
  }
  addEventListener('scroll', () => { if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress); }, { passive: true });
  addEventListener('resize', layoutRail);
  // Images and demos change the page height as they load.
  new ResizeObserver(() => layoutRail()).observe(document.body);
  layoutRail();

  // Looping animations (the Download button's shine and sparkles, the Node Maps nudge, the logo marquee) pause off screen.
  const idle = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting)));
  document.querySelectorAll('.btn-download, .try-big, .brand-marquee-track').forEach((el) => idle.observe(el));

  // The Download pill defaults to the Windows build; Mac visitors get the Mac build instead.
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (/mac/i.test(platform)) {
    document.querySelectorAll('.btn-download[data-dl-mac]').forEach((a) => { a.href = a.dataset.dlMac; });
    document.querySelectorAll('.dl-mac-hint').forEach((s) => { s.hidden = false; });
  }

  // Demo iframes load once they get near the viewport.
  const lazy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const f = e.target;
      if (!f.getAttribute('src')) f.src = f.dataset.src;
      lazy.unobserve(f);
    });
  }, { rootMargin: '600px 0px' });
  document.querySelectorAll('iframe[data-src]').forEach((f) => lazy.observe(f));

  // Try it out: the frame goes position:fixed at its own rect, then its right edge stays put
  // while width grows leftward and height follows, so it stretches right to left over the page.
  let fullFrame = null;
  const vw = () => document.documentElement.clientWidth;
  function openFrame(frame) {
    if (fullFrame) return;
    const slot = frame.parentElement, r = frame.getBoundingClientRect();
    slot.style.height = r.height + 'px'; // keep the column from collapsing
    frame.classList.add('is-full');
    // A look-only preview becomes the live demo: load the interactive version and let it take clicks.
    const live = frame.querySelector('iframe[data-try-src]');
    if (live) { live.removeAttribute('inert'); live.removeAttribute('tabindex'); live.style.pointerEvents = 'auto'; lazy.unobserve(live); live.src = live.dataset.trySrc; }
    Object.assign(frame.style, { top: r.top + 'px', right: vw() - r.right + 'px', width: r.width + 'px', height: r.height + 'px' });
    void frame.offsetWidth;
    frame.classList.add('is-grow', 'is-open');
    document.body.classList.add('no-scroll');
    Object.assign(frame.style, { top: '0px', right: '0px', width: '100vw', height: '100vh' });
    setLabel(frame, true);
    fullFrame = frame;
  }
  function closeFrame() {
    const frame = fullFrame; if (!frame) return;
    const slot = frame.parentElement, r = slot.getBoundingClientRect();
    fullFrame = null;
    document.body.classList.remove('no-scroll');
    setLabel(frame, false);
    const done = () => {
      frame.classList.remove('is-full', 'is-grow', 'is-open');
      ['top', 'right', 'width', 'height'].forEach((p) => frame.style.removeProperty(p));
      slot.style.removeProperty('height');
      const live = frame.querySelector('iframe[data-try-src]');
      if (live) { live.setAttribute('inert', ''); live.tabIndex = -1; live.style.pointerEvents = ''; live.src = live.dataset.src; }
    };
    frame.classList.remove('is-open');
    Object.assign(frame.style, { top: r.top + 'px', right: vw() - r.right + 'px', width: r.width + 'px', height: r.height + 'px' });
    if (reduced.matches) return done();
    let finished = false;
    const end = () => { if (!finished) { finished = true; done(); } };
    frame.addEventListener('transitionend', (e) => { if (e.propertyName === 'height') end(); }, { once: false });
    setTimeout(end, 900);
  }
  function setLabel(frame, open) {
    const btn = frame.querySelector('[data-fullscreen]');
    if (btn) btn.firstChild.textContent = open ? 'Close' : 'Try it out';
  }
  document.querySelectorAll('[data-fullscreen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const frame = btn.closest('[data-frame]');
      frame === fullFrame ? closeFrame() : openFrame(frame);
    });
  });

  // Game overlay, per the page contract: demos ask the shell to open or close the dungeon.
  const overlay = document.createElement('div');
  overlay.className = 'game-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Dungeon game');
  document.body.appendChild(overlay);
  function openGame() {
    overlay.innerHTML = '<iframe title="Dungeon game" src="dungeon/index.html?embed=1" allow="fullscreen; autoplay"></iframe>';
    overlay.classList.add('is-open');
    document.body.classList.add('no-scroll');
    const f = overlay.querySelector('iframe');
    f.addEventListener('load', () => f.contentWindow.focus());
    f.focus();
  }
  function closeGame() {
    overlay.classList.remove('is-open');
    overlay.innerHTML = '';
    if (fullFrame) closeFrame();
    document.body.classList.remove('no-scroll');
    const section = document.getElementById('node-maps');
    const heading = section?.querySelector('.title');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    if (section) window.scrollTo({ top: section.getBoundingClientRect().top + scrollY - document.querySelector('.nav').getBoundingClientRect().height, behavior: 'instant' });
  }
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'portfolio:open-game' && e.data.game === 'dungeon') openGame();
    if (e.data.type === 'portfolio:close-game') closeGame();
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (overlay.classList.contains('is-open')) return; // the game handles its own Esc (pause / close)
    if (fullFrame) closeFrame();
  });

  // Widget tutorial: handwriting and arrows drawn on the page itself, reaching into the widget.
  (() => {
    const section = document.getElementById('canvas-widget');
    if (!section) return;
    const btn = section.querySelector('.tut-btn'), iframe = section.querySelector('iframe'), desc = section.querySelector('.project-text') || section.querySelector('.desc');
    if (!btn || !iframe) return;
    const NS = 'http://www.w3.org/2000/svg';
    let layer = null, arrowCount = 0, maskId = 0; // every arrow bends the same way, which keeps them from crossing

    const target = (sel, index = 0) => {
      try {
        const el = iframe.contentDocument.querySelectorAll(sel)[index];
        if (!el) return null;
        const r = el.getBoundingClientRect(), f = iframe.getBoundingClientRect();
        if (!r.width) return null;
        let visibleTop = 0, visibleBottom = f.height;
        for (let node = el.parentElement; node; node = node.parentElement) {
          if (/(auto|scroll|hidden|clip)/.test(iframe.contentWindow.getComputedStyle(node).overflowY)) {
            const clip = node.getBoundingClientRect();
            visibleTop = Math.max(visibleTop, clip.top);
            visibleBottom = Math.min(visibleBottom, clip.bottom);
          }
        }
        const left = r.left + f.left, top = r.top + f.top;
        return { left, top, right: left + r.width, bottom: top + r.height, cx: left + r.width / 2, cy: top + r.height / 2,
          visible: r.top >= visibleTop && r.bottom <= visibleBottom };
      } catch (e) { return null; }
    };
    const mk = (name, attrs) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

    // A wobbly arrow, drawn twice for a sketchy look, with a hand-drawn head. `via` gives its own
    // control points (one for a curve, two for an S or a run along a gap) instead of a straight line.
    function arrow(svg, o, x1, y1, x2, y2, delay, sign, via) {
      const seed = ++arrowCount;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const bend = Math.min(60, len * 0.2) * sign;
      const wob = (n) => Math.sin(seed * 9.1 + n) * 2.4;
      const ctrl = via || [[(x1 + x2) / 2 - dy / len * bend + wob(1), (y1 + y2) / 2 + dx / len * bend + wob(2)]];
      const [cx, cy] = ctrl.at(-1);
      const P = (a, b) => `M${x1 - o.left + a} ${y1 - o.top + b} ${ctrl.length > 1 ? 'C' : 'Q'}${ctrl.map(([x, y]) => `${x - o.left} ${y - o.top}`).join(' ')} ${x2 - o.left + a * 0.4} ${y2 - o.top + b * 0.4}`;
      const add = (d, cls, w, dl) => svg.appendChild(mk('path', { d, pathLength: 1, 'stroke-width': w, class: cls, style: `--d:${dl}s` }));
      const ang = Math.atan2(y2 - cy, x2 - cx), L = 13, ex = x2 - o.left, ey = y2 - o.top;
      const head = (s) => `M${ex} ${ey} L${ex - Math.cos(ang + s) * L} ${ey - Math.sin(ang + s) * L}`;
      const headD = head(0.5) + ' ' + head(-0.5);
      // A white halo under the black ink keeps the arrows readable where they cross onto the widget's dark panel.
      add(P(0, 0), 'halo', 8, delay);
      add(headD, 'halo', 8, delay + 0.45);
      add(P(0, 0), '', 3, delay);
      add(P(1.8, -1.6), 'faint', 1.4, delay + 0.05);
      add(headD, '', 3, delay + 0.45);
    }

    function draw(tries = 0) {
      if (!layer) return;
      // The widget draws its buttons a moment after it loads; wait for them rather than pointing at nothing.
      if (!iframe.contentDocument?.querySelector('#app') && tries < 40) return void setTimeout(() => draw(tries + 1), 250);
      layer.classList.toggle('is-updating', layer.dataset.drawn === 'true');
      layer.dataset.drawn = 'true';
      layer.textContent = '';
      // Same wobble every redraw: a fresh seed each time made the arrows twitch as the widget was used.
      arrowCount = 0;
      const o = { left: -scrollX, top: -scrollY }, f = iframe.getBoundingClientRect();
      const svg = mk('svg', {});
      layer.appendChild(svg);
      const rightX = f.right + 28;
      // The drawing toolbar stays in its column on the right; notes stop short of it.
      const tools = document.querySelector('.paper-tools');
      const edge = tools?.getClientRects().length ? tools.getBoundingClientRect().left - 18 : document.documentElement.clientWidth - 24;
      const rightMax = Math.max(80, edge - rightX);
      const fs = rightMax < 170 ? 21 : 25;
      let t = 0.1;

      // side: 'right' = text starts at x, 'center' = centred on x. Returns the text box (viewport coords).
      const place = (text, side, x, y, tilt, max) => {
        const n = document.createElement('div');
        n.className = 'tut-note';
        // Keep the "(scroll down ↓)" hint together on one line, however the note wraps.
        const hint = '(scroll down ↓)';
        if (text.endsWith(hint)) {
          n.append(document.createTextNode(text.slice(0, -hint.length)));
          const keep = document.createElement('span');
          keep.style.whiteSpace = 'nowrap';
          keep.textContent = hint;
          n.append(keep);
        } else n.textContent = text;
        n.style.cssText = `left:${x - o.left}px;top:${y - o.top}px;--d:${t}s;--tilt:${tilt}deg;--fs:${fs}px;--max:${max}px;translate:${side === 'center' ? '-50%' : '0'} -50%;text-align:${side === 'center' ? 'center' : 'left'}`;
        layer.appendChild(n);
        return n.getBoundingClientRect();
      };
      const arrowTo = (x1, y1, x2, y2, via) => {
        arrow(svg, o, x1, y1, x2, y2, t + 0.55, 0, via); // 0 = straight line
        t += 0.9;
      };

      // Tutorial stays enabled as the visitor changes pages and uses controls.
      // Keep all three notes visible, with arrows only to currently visible targets; a note whose
      // target is scrolled out of view says so instead of pointing at nothing.
      const app = iframe.contentDocument.querySelector('#app');
      const active = app?.classList.contains('panel-focused')
        ? iframe.contentDocument.querySelector('.panel.active')?.id : null;
      const pageNotes = {
        'panel-assignments': [
          ['#sort-select', 'sort by due date or course'],
          ['#list-pending .asgn-check', 'tap the circle to check work off'],
          ['#sl-done', 'completed work stays here']
        ],
        'panel-grades': [
          // Top to bottom in the order their targets sit, so the two arrows can't cross. The grade
          // note points at the score box, not the title, whose right edge is the options button.
          ['.grade-card-menu-btn', 'class options and grade details'],
          ['.grade-card .gstat-box', 'your current grade in each class', 1],
          ['#tutoring-link', 'free tutoring if you need a hand']
        ],
        // One class's weekly trend replaces the course cards, so it gets its own notes.
        'grades-trend': [
          ['.grade-trend-back', 'back to all your classes'],
          ['.grade-trend-summary', 'grades received and your weekly average'],
          ['.grade-trend-chart-label', 'how your scores moved this week']
        ],
        'panel-gpa': [
          ['.gpa-transcript-row', 'enter grade points and graded units'],
          ['#gpa-eot-display', 'see your projected end-of-term GPA'],
          ['#gpa-goal-input', 'set a goal to see what it takes']
        ]
      };
      if (active) {
        let noteY = f.top + 130;
        const noteSet = active === 'panel-grades' && iframe.contentDocument.querySelector('.grade-trend-view') ? 'grades-trend' : active;
        for (const [selector, text, index] of pageNotes[noteSet] || []) {
          const r = target(selector, index);
          const checkRow = selector.includes('asgn-check') ? target('#list-pending .asgn-item') : null;
          // Level with its target where there is room, so the arrow runs nearly flat instead of across the panel.
          // The check circle's note sits level with the gap above its row instead, so its arrow can be a single elbow.
          if (r?.visible) noteY = checkRow ? checkRow.top - 12 : Math.max(noteY, Math.min(r.cy - (selector === '#sort-select' ? 26 : 0), f.bottom - 40));
          const box = place(r?.visible ? text : `${text} (scroll down ↓)`, 'right', rightX, noteY, -1, rightMax);
          const sx = box.left - 8, sy = box.top + box.height / 2;
          if (r?.visible && selector.includes('asgn-check')) {
            // Run left along the gap above the row, then turn down into the top of the circle.
            // The tip stops clear of the box so the head doesn't sit on its border, and the run sits just above the row.
            arrowTo(sx, sy, r.cx, r.top - 6, [[r.cx, sy]]);
          } else if (r?.visible && selector.includes('gstat-box')) {
            // The grade sits among other stats, so point at the card's edge level with that row instead of across it.
            const card = target('.grade-card');
            arrowTo(sx, sy, (card ? card.right : r.right) + 5, r.cy);
          } else if (r?.visible && selector === '#gpa-eot-display') {
            // The change badge sits level with the number on its right: come in over the top of it.
            arrowTo(sx, sy, r.right + 4, r.top + 6, [[f.right - 20, r.top - 12], [r.right + 30, r.top - 12]]);
          } else if (r?.visible) {
            arrowTo(sx, sy, r.right + 5, Math.max(f.top + 10, Math.min(f.bottom - 10, r.cy)));
          }
          noteY += Math.max(100, box.height + 32);
        }
        return;
      }

      // Top row: notes stacked down the right-hand side, nearest note to the rightmost button. Each arrow runs left from
      // its note and turns up into the bottom of its button, so the four arrive side by side instead of bunching up;
      // lower notes go to buttons further left, which nests the curves without crossings.
      const names = ['#mode-btn', '#theme-icon-btn', '#week-icon-btn', '#style-icon-btn'];
      const labels = ['light / dark', 'accent color', 'pick the day your week starts', 'five looks, sleek to orbit'];
      const tops = names.map((n) => target(n));
      const rowBottom = Math.max(...tops.filter(Boolean).map((r) => r.bottom), f.top + 40);
      const showBtn = target('#chart-show-btn');
      let ny = rowBottom + 42;
      // With the chart hidden, the Show chart button sits under the toolbar; give its note the row beside it.
      if (showBtn) ny = Math.max(ny, showBtn.bottom + 52);
      tops.forEach((r, i) => {
        if (!r) return;
        const box = place(labels[i], 'right', rightX, ny, i % 2 ? 1.2 : -1.2, rightMax);
        // Aim along the line to the button's centre and stop just outside it, so the arrow's
        // direction points at the icon rather than at a spot beside it.
        const sx = box.left - 8, sy = box.top + box.height / 2;
        arrowTo(sx, sy, r.cx, r.bottom + 5, [[r.cx, sy]]);
        ny += Math.max(46, box.height + 18);
      });

      // Chart button: note on the right, arrow straight back to the button's right edge.
      const chart = showBtn || target('#chart-style-bar .chart-switch') || target('#chart-cycle-btn');
      if (chart) {
        const box = place(showBtn ? 'show the chart again' : 'rings, bars, or hide it', 'right', rightX, showBtn ? showBtn.cy : Math.max(chart.cy, ny + 10), -1.5, rightMax);
        arrowTo(box.left - 8, box.top + box.height / 2, chart.right + 5, chart.cy);
      }
      // The toolbar arrows pass behind the Show chart button rather than across it.
      if (showBtn) {
        const id = `tut-behind-${++maskId}`, big = { x: -5000, y: -5000, width: 20000, height: 30000 };
        const mask = mk('mask', { id, maskUnits: 'userSpaceOnUse', ...big });
        mask.append(mk('rect', { ...big, fill: '#fff' }), mk('rect', { x: showBtn.left - 2 - o.left, y: showBtn.top - 2 - o.top, width: showBtn.right - showBtn.left + 4, height: showBtn.bottom - showBtn.top + 4, rx: 10, fill: '#000' }));
        // Masking a group, not the 1px svg itself, which would clip every arrow away.
        const group = mk('g', { mask: `url(#${id})` });
        group.append(...svg.childNodes);
        svg.append(mask, group);
      }

      // Tabs: each note sits just under its tab, with a short arrow straight up to it.
      const tabKeys = ['assignments', 'grades', 'gpa'];
      const tabText = ['check off this week’s work', 'grades + what you need', 'GPA + goal math'];
      tabKeys.map((k) => target(`.tab-btn[data-tab="${k}"]`)).forEach((r, i) => {
        if (!r) return;
        // Pinned under the widget, so they stay put when the tabs move up (for example, with the chart hidden).
        const ny = Math.max(r.bottom + 62, f.bottom + 38);
        place(tabText[i], 'center', r.cx, ny, i === 1 ? 1.2 : -1.2, Math.max(96, r.right - r.left - 8));
        arrowTo(r.cx + 2, ny - 22, r.cx, r.bottom + 5);
      });
    }

    let drawFrame = 0;
    function scheduleDraw() {
      if (!layer || drawFrame) return;
      drawFrame = requestAnimationFrame(() => { drawFrame = 0; draw(); });
    }

    // Notes need about 210px between the widget and the toolbar. Where the window is too narrow for
    // that, the widget slides left into the gap beside its description while the tutorial is open.
    const stack = section.querySelector('.widget-stack');
    let shift = 0;
    function makeRoom() {
      if (!stack) return;
      let next = 0;
      if (layer) {
        const tools = document.querySelector('.paper-tools');
        const edge = tools?.getClientRects().length ? tools.getBoundingClientRect().left : document.documentElement.clientWidth;
        const r = stack.getBoundingClientRect(), right = r.right + shift, left = r.left + shift;
        next = Math.round(Math.max(0, Math.min(right - (edge - 18 - 210 - 28), left - (desc?.getBoundingClientRect().right ?? 0) - 32)));
      }
      if (next === shift) return false;
      shift = next;
      stack.style.translate = shift ? `${-shift}px 0` : '';
      // The demo footnote under the widget travels with it, so the notes never write over it.
      const footnote = section.querySelector('.demo-context');
      if (footnote) footnote.style.transform = shift ? `translateX(${-shift}px)` : '';
      // His walking edges follow the frame to its new place.
      setTimeout(() => dispatchEvent(new Event('paper:layout')), reduced.matches ? 0 : 480);
      return true;
    }
    stack?.addEventListener('transitionend', (e) => { if (e.propertyName === 'translate') scheduleDraw(); });

    function open() {
      if (layer) return;
      layer = document.createElement('div');
      layer.className = 'tut-layer';
      layer.setAttribute('aria-hidden', 'true');
      if (!iframe.getAttribute('src')) iframe.src = iframe.dataset.src;
      document.body.appendChild(layer);
      document.body.classList.add('canvas-widget-tutorial');
      btn.setAttribute('aria-pressed', 'true');
      bindWidget();
      // If the widget has to slide over first, draw once it has arrived.
      if (!makeRoom() || reduced.matches) draw();
    }
    function close() {
      if (!layer) return;
      cancelAnimationFrame(drawFrame); drawFrame = 0;
      // Fade the ink out rather than cutting it; a new tutorial can open while this one fades.
      const old = layer;
      old.classList.add('is-leaving');
      setTimeout(() => old.remove(), reduced.matches ? 0 : 320);
      layer = null;
      document.body.classList.remove('canvas-widget-tutorial');
      btn.setAttribute('aria-pressed', 'false');
      makeRoom();
    }
    btn.addEventListener('click', () => (layer ? close() : open()));
    addEventListener('keydown', (e) => e.key === 'Escape' && close());
    addEventListener('resize', () => { makeRoom(); scheduleDraw(); });
    const boundDocuments = new WeakSet();
    function bindWidget() {
      const doc = iframe.contentDocument;
      if (!doc || boundDocuments.has(doc)) return;
      boundDocuments.add(doc);
      for (const event of ['click', 'keydown', 'input', 'change', 'scroll', 'transitionend', 'animationend']) {
        doc.addEventListener(event, scheduleDraw, { capture: true, passive: true });
      }
      // Layout often settles after a click (a hidden chart collapsing, a panel opening), so draw again once it has.
      doc.addEventListener('click', () => setTimeout(scheduleDraw, 450), { capture: true, passive: true });
      const app = doc.querySelector('#app');
      if (app) {
        new MutationObserver(scheduleDraw).observe(app, {
          subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden']
        });
        new ResizeObserver(scheduleDraw).observe(app);
      }
      doc.fonts?.ready.then(scheduleDraw);
    }
    iframe.addEventListener('load', () => { bindWidget(); if (layer) draw(); });
    bindWidget();
  })();
})();
