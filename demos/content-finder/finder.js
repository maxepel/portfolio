// Content Finder demo: drag a folder in, watch it unpack and get tagged, then search by what is in the pictures.
// The tags come from library.js; the scan is staged so the demo runs offline.
(() => {
  const FOLDERS = window.FINDER_FOLDERS, SYN = window.FINDER_SYNONYMS;
  const $ = (id) => document.getElementById(id);
  const q = $('q'), grid = $('grid'), lib = $('library'), empty = $('empty'), note = $('note'), suggest = $('suggest'), hint = $('hint');
  const statusEl = $('status'), statusText = $('status-text'), statusTags = $('status-tags'), bar = $('bar'), count = $('count'), resetBtn = $('reset');
  const searchBox = q.closest('.search');
  const dateFilters = $('date-filters'), dateFrom = $('date-from'), dateThrough = $('date-through');
  const dateQuery = window.FINDER_DATES;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 560px)');
  const folders = [...document.querySelectorAll('.folder')];
  const EASE = 'cubic-bezier(.22, .8, .24, 1)';

  let library = []; // { item, data, el, tagged, added }, newest folder first
  const added = new Set();
  let busy = false, activeImports = 0;

  const wait = (ms) => new Promise((r) => setTimeout(r, reduced.matches ? 0 : ms));
  const dur = (ms) => (reduced.matches ? 1 : ms);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // "18 images · 1 video": photos and clips are counted apart everywhere a count shows.
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function tally(items) {
    const videos = items.filter((it) => it.video).length, images = items.length - videos;
    return videos ? `${plural(images, 'image')} · ${plural(videos, 'video')}` : plural(images, 'image');
  }
  folders.forEach((f) => { f.querySelector('.folder-meta').textContent = tally(FOLDERS[f.dataset.folder].items); });

  // ── Status bar ──────────────────────────────
  function setStatus(html, frac, isBusy) {
    statusText.innerHTML = html;
    bar.style.width = (frac * 100).toFixed(1) + '%';
    statusEl.classList.toggle('is-busy', isBusy);
  }
  const updateCount = () => { count.textContent = tally(library.map((en) => en.item)); };

  // ── Hint: points at the next folder to drag ──
  function placeHint() {
    const next = folders.find((f) => !added.has(f.dataset.folder));
    if (!next) return hint.classList.add('is-off');
    const first = !added.size, later = added.size === folders.length - 1 ? 'one more' : 'try another';
    if (narrow.matches) {
      hint.textContent = first ? '↑ drag me in' : '↑ ' + later;
      hint.style.left = next.offsetLeft + 'px';
      hint.style.top = next.offsetTop + next.offsetHeight + 18 + 'px';
    } else {
      hint.textContent = first ? 'drag me in →' : later + ' →';
      hint.style.left = next.offsetLeft + next.offsetWidth - 14 + 'px';
      hint.style.top = next.offsetTop + 22 + 'px';
    }
    hint.classList.remove('is-off');
  }
  addEventListener('resize', placeHint);
  narrow.addEventListener('change', placeHint);

  // ── Dragging a folder ──────────────────────
  function makeGhost(f) {
    const g = document.createElement('div');
    g.className = 'ghost';
    g.style.setProperty('--c', f.style.getPropertyValue('--c'));
    g.append(f.querySelector('.folder-art').cloneNode(true), f.querySelector('.folder-name').cloneNode(true));
    document.body.appendChild(g);
    return g;
  }
  function moveGhost(g, x, y) {
    g.x = x; g.y = y;
    g.style.transform = `translate(${x - 60}px, ${y - 40}px)`;
  }
  function flyGhost(g, x, y, ms) {
    const from = g.style.transform;
    moveGhost(g, x, y);
    return g.animate([{ transform: from }, { transform: g.style.transform }], { duration: dur(ms), easing: EASE }).finished;
  }
  const overLib = (e) => {
    const r = lib.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  folders.forEach((f) => {
    f.addEventListener('pointerdown', (e) => {
      if (added.has(f.dataset.folder) || e.button > 0) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      let ghost = null;
      f.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
          ghost = makeGhost(f);
          f.classList.add('is-lifted');
          lib.classList.add('is-target');
          hint.classList.add('is-off');
        }
        moveGhost(ghost, ev.clientX, ev.clientY);
        lib.classList.toggle('is-over', overLib(ev));
      };
      const up = (ev) => {
        f.removeEventListener('pointermove', move);
        f.removeEventListener('pointerup', up);
        f.removeEventListener('pointercancel', up);
        lib.classList.remove('is-target', 'is-over');
        if (!ghost) return; // a plain click; the click handler takes it
        f.dataset.dragged = '1';
        if (ev.type === 'pointerup' && overLib(ev)) return void ingest(f, ghost);
        // Dropped outside: the folder floats back home.
        flyGhost(ghost, ...centerOf(f), 320).then(() => { ghost.remove(); f.classList.remove('is-lifted'); placeHint(); });
      };
      f.addEventListener('pointermove', move);
      f.addEventListener('pointerup', up);
      f.addEventListener('pointercancel', up);
    });
    // Clicking (or Enter) adds the folder too, flying it over for you.
    f.addEventListener('click', () => {
      if (f.dataset.dragged) return void delete f.dataset.dragged;
      if (added.has(f.dataset.folder)) return;
      const ghost = makeGhost(f);
      moveGhost(ghost, ...centerOf(f));
      f.classList.add('is-lifted');
      ingest(f, ghost);
    });
  });
  // A real file dropped on the demo should not navigate the frame away.
  ['dragover', 'drop'].forEach((t) => addEventListener(t, (e) => e.preventDefault()));

  // ── Tiles ──────────────────────────────────
  function makeTile(item, data) {
    const el = document.createElement('figure');
    el.className = 'tile is-waiting';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', item.title);
    el.style.setProperty('--h', item.hue);
    el.innerHTML = '<span class="tile-ph"></span><div class="scan"></div>';
    el.querySelector('.tile-ph').textContent = item.title;
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => el.classList.add('has-img');
    img.onerror = () => img.remove();
    img.src = data.dir + (item.poster || item.file);
    el.prepend(img);
    if (item.video) addClip(el, data.dir + item.file, item.length);
    const entry = { item, data, el, tagged: false, added: new Date() };
    el.addEventListener('click', () => openViewer(entry));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(entry); } });
    return entry;
  }

  // Video tiles show their poster frame and a length badge; hovering or focusing plays the clip, muted and looping.
  function addClip(el, src, length) {
    el.classList.add('is-video');
    el.insertAdjacentHTML('beforeend', `<span class="tile-play"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.5v7l6-3.5z"/></svg>${esc(length || '')}</span>`);
    let clip = null;
    const play = () => {
      if (el.classList.contains('is-waiting')) return;
      if (!clip) {
        clip = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true, preload: 'auto' });
        clip.setAttribute('aria-hidden', 'true');
        clip.addEventListener('playing', () => el.classList.add('is-playing'));
        el.querySelector('img')?.after(clip);
      }
      clip.play().catch(() => {});
    };
    const stop = () => { if (clip) { clip.pause(); el.classList.remove('is-playing'); } };
    el.addEventListener('mouseenter', play);
    el.addEventListener('mouseleave', stop);
    el.addEventListener('focus', play);
    el.addEventListener('blur', stop);
  }

  // Slide tiles from where they were to where they are now.
  function flip(before, entries) {
    entries.forEach((en) => {
      const a = before.get(en);
      if (!a) return;
      const b = en.el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) en.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur(420), easing: EASE });
    });
  }
  const rects = (entries) => new Map(entries.filter((en) => !en.el.hidden).map((en) => [en, en.el.getBoundingClientRect()]));

  // ── Drop → unpack → scan ───────────────────
  async function ingest(f, ghost) {
    const data = FOLDERS[f.dataset.folder];
    busy = true; activeImports++;
    added.add(f.dataset.folder);
    placeHint();
    folders.forEach((x) => { x.disabled = added.has(x.dataset.folder); });
    f.classList.remove('is-lifted');
    f.classList.add('is-done');
    clearSearch();
    q.disabled = true;
    resetBtn.hidden = true;
    suggest.hidden = true;
    statusTags.textContent = '';
    empty.classList.add('is-gone');
    lib.scrollTop = 0;

    // Land the folder near the top of the library, where the new tiles will appear.
    const lr = lib.getBoundingClientRect();
    await flyGhost(ghost, lr.left + lr.width / 2, lr.top + Math.min(90, lr.height * 0.28), 380);
    ghost.classList.add('is-open');
    setStatus(`Unpacking <b>${esc(data.name)}</b>`, 0, true);
    await wait(380);

    const before = rects(library);
    const entries = data.items.map((item) => makeTile(item, data));
    grid.prepend(...entries.map((en) => en.el));
    flip(before, library);
    library = [...entries, ...library];
    updateCount();

    // Each image flies out of the open folder into its slot.
    const flights = entries.map((en, i) => {
      const r = en.el.getBoundingClientRect();
      if (r.top > lr.bottom + 40) return null; // below the fold: it just appears
      const dx = ghost.x - (r.left + r.width / 2), dy = ghost.y - (r.top + r.height / 2);
      const spin = (i % 2 ? 1 : -1) * (6 + (i % 5) * 3);
      return en.el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.16) rotate(${spin}deg)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: 'none', opacity: 1 }
      ], { duration: dur(640), delay: reduced.matches ? 0 : i * 45, easing: 'cubic-bezier(.2, .75, .25, 1)', fill: 'backwards' }).finished;
    });
    await Promise.all(flights.filter(Boolean));
    ghost.animate([{ opacity: 1 }, { opacity: 0, scale: '.6' }], { duration: dur(260), fill: 'forwards' }).finished.then(() => ghost.remove());

    await scan(entries);

    busy = --activeImports > 0;
    placeHint();
    if (busy) return;
    setStatus(`<b>${tally(library.map(en => en.item))}</b> tagged. Try a search.`, 1, false);
    folders.forEach((x) => { x.disabled = added.has(x.dataset.folder); });
    q.disabled = false;
    q.placeholder = 'Search contents or dates, e.g. July 2026…';
    dateFilters.hidden = false;
    searchBox.removeAttribute('aria-disabled');
    searchBox.classList.remove('is-ready');
    void searchBox.offsetWidth;
    searchBox.classList.add('is-ready');
    resetBtn.hidden = false;
    showSuggest([...new Set([...added].flatMap(id => FOLDERS[id].suggest))]);
    placeHint();
  }

  async function scan(entries) {
    const total = entries.length, queue = [...entries];
    const lanes = total > 20 ? 5 : 3;
    statusTags.textContent = '';
    const tick = () => {
      const total = [...added].reduce((n, id) => n + FOLDERS[id].items.length, 0);
      const tagged = library.filter(en => en.tagged).length;
      setStatus(`<span class="spark"></span>ChatGPT is tagging <b>${tagged} / ${total}</b>`, tagged / total, true);
    };
    tick();
    const worker = async () => {
      while (queue.length) {
        const en = queue.shift();
        en.el.classList.replace('is-waiting', 'is-scanning');
        await wait(560 + Math.random() * 380);
        en.el.classList.remove('is-scanning');
        en.tagged = true;
        tick();
      }
    };
    await Promise.all(Array.from({ length: lanes }, (_, i) => wait(i * 180).then(worker)));
    await wait(200);
    tick();
  }

  function showSuggest(words) {
    suggest.innerHTML = '<small>Try</small>' + words.map((w, i) => `<button type="button" style="--i:${i}">${esc(w)}</button>`).join('');
    suggest.hidden = false;
  }
  suggest.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || q.disabled) return;
    q.value = b.textContent;
    search();
  });

  // ── Search ─────────────────────────────────
  // Tags, their single words, and every synonym form the words the search understands.
  const STOP = new Set('a an the for of some something with in on at and to or photo photos picture pictures image images pic pics me show find i want like that is are any all my our from by'.split(' '));
  const vocab = new Set();
  const addWords = (s) => { s = norm(s); vocab.add(s); s.split(' ').forEach((w) => vocab.add(w)); };
  Object.values(FOLDERS).forEach((d) => d.items.forEach((it) => it.tags.forEach(addWords)));
  Object.entries(SYN).forEach(([k, vs]) => { addWords(k); vs.forEach(addWords); });
  let phrases = [], words = [];
  const indexVocab = () => {
    phrases = [...vocab].filter((w) => w.includes(' ')).sort((a, b) => b.length - a.length);
    words = [...vocab].filter((w) => !w.includes(' '));
  };
  indexVocab();

  function lev(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = t;
      }
    }
    return d[b.length];
  }
  // Typos land on the nearest known word: "bech" finds the beach.
  function correct(w) {
    if (vocab.has(w)) return w;
    if (w.endsWith('s') && vocab.has(w.slice(0, -1))) return w.slice(0, -1);
    if (w.length < 4) return w;
    const limit = w.length >= 7 ? 2 : 1;
    let best = w, bestD = limit + 1;
    for (const v of words) {
      if (Math.abs(v.length - w.length) > limit) continue;
      const dd = lev(w, v);
      if (dd < bestD) { best = v; bestD = dd; }
    }
    return best;
  }
  // A term reaches its synonyms, and any word that lists it as one.
  function expand(t) {
    const out = new Set([t]);
    (SYN[t] || []).forEach((v) => out.add(norm(v)));
    for (const k in SYN) if (SYN[k].some((v) => norm(v) === t)) out.add(k);
    return out;
  }
  function parse(raw) {
    let rest = ' ' + norm(raw).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const terms = [];
    phrases.forEach((p) => { if (rest.includes(' ' + p + ' ')) { terms.push(p); rest = rest.replace(' ' + p + ' ', ' '); } });
    let fixed = false;
    rest.split(' ').filter((w) => w && !STOP.has(w)).forEach((w) => {
      const c = correct(w);
      if (c !== w && c !== w + 's' && c + 's' !== w) fixed = true; // plurals are not typos
      terms.push(c);
    });
    return { terms, fixed };
  }

  let searchTimer = 0;
  q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 140); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; search(); } });

  [dateFrom, dateThrough].forEach(input => input.addEventListener('change', search));
  $('date-clear').addEventListener('click', () => { dateFrom.value = ''; dateThrough.value = ''; search(); });

  function search() {
    const raw = q.value.trim();
    suggest.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.textContent === raw));
    if (!raw && !dateFrom.value && !dateThrough.value) return show(library, null);
    const dates = dateQuery.parse(raw);
    const { terms, fixed } = parse(dates.text);
    const hits = [];
    library.forEach((en, idx) => {
      if (!en.tagged || !dateQuery.matches(en.item.date, dates, dateFrom.value, dateThrough.value)) return;
      const tags = en.item.tags.map(norm);
      const bag = new Set(tags.flatMap((t) => [t, ...t.split(' ')]));
      let score = 0;
      terms.forEach((t) => { if ([...expand(t)].some((r) => bag.has(r))) score++; });
      if (score || !terms.length) hits.push({ en, score, idx });
    });
    hits.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const shown = terms.join(' ');
    if (!hits.length) note.innerHTML = `No matches for these contents and dates. Try another search or clear the date filters.`;
    else note.innerHTML = (fixed ? `Showing results for <b>${esc(shown)}</b> · ` : '') + `<b>${hits.length}</b> ${hits.length === 1 ? 'match' : 'matches'}`;
    show(hits.map((h) => h.en), hits.length);
  }

  function show(order, n) {
    const before = rects(library);
    const visible = new Set(order);
    library.forEach((en) => { en.el.hidden = !visible.has(en); });
    [...order, ...library.filter((en) => !visible.has(en))].forEach((en) => grid.appendChild(en.el));
    grid.classList.toggle('is-searching', n !== null);
    note.hidden = n === null;
    count.textContent = tally((n === null ? library : order).map((en) => en.item));
    flip(before, order);
    order.forEach((en) => { if (!before.has(en)) en.el.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: dur(300), easing: EASE }); });
    lib.scrollTop = 0;
  }
  function clearSearch() {
    if (!q.value && !grid.classList.contains('is-searching')) return;
    q.value = '';
    dateFrom.value = ''; dateThrough.value = '';
    show(library, null);
  }

  // ── Viewer ─────────────────────────────────
  const viewer = $('viewer'), vImg = $('v-img');
  const tagForm = $('v-add'), tagInput = $('v-new-tag');
  let returnFocus = null, viewing = null;
  function renderTags(en) {
    $('v-tags').innerHTML = en.tagged
      ? en.item.tags.map((t, i) => `<span>${esc(t)}<button type="button" data-i="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join('')
      : '<em>Waiting to be scanned…</em>';
    tagForm.hidden = !en.tagged;
  }
  // Removing a tag takes the image out of searches for it right away.
  $('v-tags').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b || !viewing) return;
    viewing.item.tags.splice(Number(b.dataset.i), 1);
    renderTags(viewing);
    if (q.value.trim() || dateFrom.value || dateThrough.value) search();
    tagInput.focus();
  });
  // A tag added here is searchable straight away, typo-forgiveness included.
  tagForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const tag = tagInput.value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
    if (!tag || !viewing) return;
    if (!viewing.item.tags.some((t) => norm(t) === norm(tag))) {
      viewing.item.tags.push(tag);
      addWords(tag);
      indexVocab();
      renderTags(viewing);
      $('v-tags').lastElementChild.classList.add('is-new');
      if (q.value.trim() || dateFrom.value || dateThrough.value) search();
    }
    tagInput.value = '';
  });
  function openViewer(en) {
    returnFocus = en.el;
    viewing = en;
    vImg.style.setProperty('--h', en.item.hue);
    vImg.innerHTML = '';
    const img = en.el.querySelector('img');
    if (en.item.video) {
      const v = Object.assign(document.createElement('video'), { src: en.data.dir + en.item.file, poster: img?.src || '', muted: true, loop: true, autoplay: true, controls: true, playsInline: true });
      v.setAttribute('aria-label', en.item.title);
      vImg.appendChild(v);
    } else if (img && en.el.classList.contains('has-img')) { const big = img.cloneNode(); big.alt = en.item.title; vImg.appendChild(big); }
    $('v-title').textContent = en.item.title;
    renderTags(en);
    tagInput.value = '';
    const time = en.added.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const meta = [['Folder', en.data.name], ['File', en.item.file], ...(en.item.date ? [['Date taken', new Date(en.item.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })]] : []), ...(en.item.video ? [['Type', `Video · ${en.item.length}`]] : []), ['Added', 'Today, ' + time], ['Tagged by', en.tagged ? 'ChatGPT' : 'Pending']];
    let rows = meta.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const credit = (window.FINDER_CREDITS || {})[en.item.file];
    if (credit) rows += `<dt>Credit</dt><dd><a href="${esc(credit.url)}" target="_blank" rel="noopener">${esc(credit.by)}</a> · ${esc(credit.license)}</dd>`;
    $('v-meta').innerHTML = rows;
    viewer.hidden = false;
    $('v-close').focus();
  }
  function closeViewer() {
    if (viewer.hidden) return;
    viewer.hidden = true;
    vImg.innerHTML = ''; // stops a playing clip
    returnFocus?.focus();
  }
  $('v-close').addEventListener('click', closeViewer);
  viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer(); });

  // ── Clear ──────────────────────────────────
  resetBtn.addEventListener('click', () => {
    if (busy) return;
    q.value = '';
    dateFrom.value = ''; dateThrough.value = ''; dateFilters.hidden = true;
    grid.textContent = '';
    library = [];
    added.clear();
    folders.forEach((f) => { f.disabled = false; f.classList.remove('is-done'); });
    grid.classList.remove('is-searching');
    note.hidden = true;
    suggest.hidden = true;
    resetBtn.hidden = true;
    q.disabled = true;
    q.placeholder = 'Add a folder to start searching';
    searchBox.setAttribute('aria-disabled', 'true');
    searchBox.classList.remove('is-ready');
    empty.classList.remove('is-gone');
    statusTags.textContent = '';
    setStatus('Library is empty', 0, false);
    updateCount();
    placeHint();
  });

  placeHint();

  // Open with the ocean folder already unpacked, so a visitor lands on a working search.
  // Add ?empty to the URL to start from the empty library instead.
  if (!/[?&]empty\b/.test(location.search)) {
    setTimeout(() => folders.find((f) => f.dataset.folder === 'ocean')?.click(), 700);
  }
})();
