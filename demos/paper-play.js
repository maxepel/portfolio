import { createRope, stepRope, kickRope } from './paper-physics.js';
import { threadHousePins, HOUSE_LINKS } from './paper-house.js';
import { drawCord, drawKnot, pinSprite, pinWaist, PIN_HEAD_REACH } from './paper-art.js';
import { createGuide } from './paper-guide.js?gap=20&tour=12&pin-visibility=1&walk-frequency=1&climb-fall=1&description-wrap=1&polish=6&stickothy=1&recognition=1&quiet=1&native-cursors=1&wrap=1&pages=1&dj=2&notes=3';

/* Page-space pencil marks, springy cotton string, and a guide who walks the paths you build. */
(() => {
  'use strict';
  const host = document.querySelector('.paper-playground');
  if (!host) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.classList.add('paper-play');
  canvas.className = 'paper-canvas';
  canvas.tabIndex = -1;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Paper playground. Use the toolbar for drawing tools. A stick-figure guide walks along the lines and string you make.');
  // The canvases sit in the page itself, so the browser scrolls them with the content
  // instead of the drawing chasing the scroll a frame behind.
  const layer = document.createElement('div');
  layer.className = 'paper-layer';
  layer.append(canvas);
  document.body.append(layer);
  // Iframe events cannot reach this document. Only the pins get hit targets above
  // embedded demos; the rest of the overlay lets their normal controls through.
  const pinTargets = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pinTargets.classList.add('paper-pin-targets');
  pinTargets.setAttribute('aria-hidden', 'true');
  layer.append(pinTargets);
  const pinHits = [];

  const icons = {
    browse: '<path d="m7 3 12 9-6 1-3 7-3-17Z"/>',
    pencil: '<g transform="translate(5 22) rotate(35) scale(.55)" stroke-width=".7"><path d="M-2-6v-26h4v26Z" fill="#e3b431" stroke="#a57622"/><path d="M-.6-6v-26" stroke="#ffe58a"/><path d="M-2-6 0 0 2-6Z" fill="#d8b587" stroke="#9e7950"/><path d="M-.8-2 0 0 .8-2" fill="#34352e" stroke="#34352e"/><path d="M-2-32v-3h4v3Z" fill="#b7b7ac" stroke="#858a85"/><path d="M-2-35v-3q2-1 4 0v3Z" fill="#d98b87" stroke="#ab6967"/></g>',
    eraser: `<defs>
      <linearGradient id="paper-eraser-top" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#f4beb5"/><stop offset=".5" stop-color="#df9a91"/><stop offset="1" stop-color="#ca827c"/></linearGradient>
      <linearGradient id="paper-eraser-side" x2="0" y2="1"><stop stop-color="#bd7973"/><stop offset="1" stop-color="#a36561"/></linearGradient>
    </defs>
    <g stroke-width=".55" stroke-linejoin="round">
      <ellipse cx="12" cy="20.4" rx="8.5" ry="1.3" fill="#493521" stroke="none" opacity=".12"/>
      <path d="m3.2 13.8 10.5-10q.7-.6 1.4-.1l5.5 3.7q.5.3.3.9L10.4 18.6q-.6.6-1.3.2l-5.6-3.6q-.5-.4-.3-1.4Z" fill="url(#paper-eraser-top)" stroke="#ad6e69"/>
      <path d="m10.4 18.6 10.5-10.3-.2 3.5q0 .5-.4.9l-9.7 9q-.5.4-1 .1l-.5-3q.7.4 1.3-.2Z" fill="url(#paper-eraser-side)" stroke="#995e5a"/>
      <path d="m3.2 13.8.3 1.4 5.6 3.6.5 3-5.8-3.7q-.6-.4-.6-1Z" fill="#cf8b83" stroke="#ab6d66"/>
      <path d="m4.2 13.5 9.9-9.3q.4-.4.9-.1l4.9 3.3" fill="none" stroke="#f9d5c9" stroke-width=".65"/>
      <path d="m4.3 14.8 4.9 3.1 10.6-10" fill="none" stroke="#edb5aa" stroke-width=".4"/>
      <path d="m4.6 13.8 1 .5m-.2-1.7.7.4m.6 2.8.9.5" fill="none" stroke="#a97c74" stroke-width=".45" opacity=".5"/>
    </g>`,
    pins: '',
    undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(0 -2)"/>',
    clear: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>'
  };
  const sketchIcons = {
    pencil: `<path d="m4.5 16.8 10-12.3q.8-1 1.9-.2l3.2 2.5q1 .8.1 1.8L9.5 20.8l-6 1Z" fill="#fff"/>
      <path d="m5 17 4.5 3.7M13.5 5.8l5 3.8M15 4.1l4.7 3.7M7.1 17.8 15 8"/>
      <path d="m3.5 21.8 1-3.1 2.2 2.6Z" fill="currentColor" stroke="none"/>
      <path d="m9.6 15.8 5-6.1m-1.2-3.5 4.9 3.9" opacity=".4" stroke-width=".7"/>`,
    eraser: `<path d="m3.7 13.2 9.1-9q1-1 2.3-.2l5.3 3.8q.8.6.2 1.7l-8.4 10.3-2.3 1.5-6.5-4.5Z" fill="#fff"/>
      <path d="m3.7 13.2 6.5 4.4L20.6 8M10.2 17.6l-.3 3.7M8.7 8.2l6.5 4.4M7.7 9.5l6.4 4.4"/>
      <path d="m5.2 15 .3 1.8m1.4-.7.2 1.9m1.4-.7.2 1.9M14 5.7l4.1 2.8M3 22l4.2-.3m8 .4 4.8-.2" opacity=".45" stroke-width=".75"/>`,
    pins: `<path d="m7 5.5 8.3-2.8q1.2-.4 1.7.7l.8 2q.4 1.1-.8 1.6L8.7 9.9q-1 .3-1.5-.7l-.8-2q-.4-1 .6-1.7Z" fill="#fff"/>
      <path d="m9 9.7 1 4.7-1.3 2q-.5.8.5 1.1l10.1-3.5q.8-.4 0-1L17 12.1l-2.3-4.3" fill="#fff"/>
      <path d="m13.3 16.4 2.2 6.2 1-7.3M8 7.2l8.1-2.7M11 11l.7 2.6m1.2-3.6 1 2.9m1-3.8 1.2 3.1"/>
      <path d="m10.2 16.1 7.4-2.6M7.7 4.4l6.8-2.2" opacity=".4" stroke-width=".7"/>`
  };
  const svg = name => {
    if (document.body.dataset.projectFocus === 'true' && sketchIcons[name]) {
      return `<svg class="paper-tool-sketch" viewBox="0 0 24 24" aria-hidden="true">${sketchIcons[name]}</svg>`;
    }
    return name === 'pins' ? '<img class="paper-pin-icon" alt="" aria-hidden="true">' : `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  };
  const COLORS = [
    { name: 'Graphite', ink: '#48473f' },
    { name: 'Red', ink: '#b8372c' },
    { name: 'Blue', ink: '#2c5aa8' },
    { name: 'Green', ink: '#2f7650' }
  ];
  const help = (name, label) => `<button type="button" class="paper-help" data-paper-help="${name}" aria-label="How ${label} works"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5a3 3 0 0 1 6 0c0 2-3 2-3 4v.5"/><circle cx="8" cy="12.5" r=".8" fill="currentColor" stroke="none"/></svg></button>`;
  const tools = document.createElement('aside');
  tools.className = 'paper-tools';
  tools.setAttribute('aria-label', 'Play with the page');
  tools.innerHTML = `<div id="paper-tool-panel" class="paper-tool-panel"><div class="paper-tray" role="toolbar" aria-label="Drawing and string course tools">
    <span class="paper-tool"><button type="button" data-paper-tool="browse" aria-pressed="true" title="Browse projects (V or Escape)">${svg('browse')}<span>Browse</span></button>${help('browse', 'Browse')}</span>
    <span class="paper-tool"><button type="button" data-paper-tool="pencil" aria-pressed="false" title="Draw with pencil (D)">${svg('pencil')}<span>Pencil</span></button>${help('pencil', 'Pencil')}</span>
    <span class="paper-tool"><button type="button" data-paper-tool="eraser" aria-pressed="false" title="Erase pencil marks (E)">${svg('eraser')}<span>Eraser</span></button>${help('eraser', 'Eraser')}</span>
    <span class="paper-tool"><button type="button" data-paper-tool="pins" aria-pressed="false" title="Place a pin; click it first, then place another pin to tie string (T)">${svg('pins')}<span>Pin</span></button>${help('pins', 'Pin')}</span>
    <span class="paper-divider" aria-hidden="true"></span>
    <span class="paper-tool"><button type="button" data-paper-action="undo" disabled title="Undo (Ctrl/Cmd + Z)">${svg('undo')}<span>Undo</span></button>${help('undo', 'Undo')}</span>
    <span class="paper-tool"><button type="button" data-paper-action="clear" title="Clear all marks and pins (you can undo)">${svg('clear')}<span>Clear</span></button>${help('clear', 'Clear')}</span>
  </div><p class="paper-hint" role="status" aria-live="polite"></p></div>`;
  document.body.append(tools);
  const hint = tools.querySelector('.paper-hint');
  const toolPanel = tools.querySelector('.paper-tool-panel');
  let boxToggle = null;
  if (document.body.dataset.projectFocus === 'true') {
    boxToggle = document.createElement('button');
    boxToggle.type = 'button'; boxToggle.className = 'paper-box-toggle';
    boxToggle.setAttribute('aria-label', 'Pencil box');
    boxToggle.title = 'Pencil box';
    boxToggle.innerHTML = `<svg class="paper-box-sketch" viewBox="7 11 99 65" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="m12 37 72 7 17-13-2 28-16 13-70-9Z" fill="#fff"/>
      <path d="m84 44-1 28M16 58l62 8m9-9 10-8"/>
      <path d="m19 59 3-5m3 6 3-5m3 6 3-5m3 6 3-5m3 6 3-5" opacity=".3" stroke-width=".8"/>
      <g class="paper-box-lid">
        <path d="M12 37 29 25 101 31 84 45Z" fill="#fff"/>
        <path d="m12 37 1 5 71 8 17-14v-5L84 45Z" fill="#fff"/>
        <path d="m84 45 0 5M20 36l62 6 11-9-62-5Z"/>
        <path d="m25 35 54 5 8-6-54-4Z" opacity=".3" stroke-width=".7"/>
        <path d="m46 46 12 1-1 7-11-1Z" fill="#fff"/>
        <path d="m50 50 3 .3"/>
      </g>
      <path d="m16 66 66 7 16-12" opacity=".3" stroke-width=".7"/>
    </svg>`;
    boxToggle.setAttribute('aria-controls', 'paper-tool-panel');
    boxToggle.setAttribute('aria-expanded', 'false');
    tools.prepend(boxToggle); toolPanel.hidden = true;
    boxToggle.addEventListener('click', () => setBox(!boxOpen));
  }
  const undoButton = tools.querySelector('[data-paper-action="undo"]');
  const clearButton = tools.querySelector('[data-paper-action="clear"]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let tool = 'browse', strokes = [], pins = [], links = [], selected = -1, history = [], gesture = null, starterCourse = true;
  let boxAnimation = null;
  let ropes = [], boxOpen = false, guide = null, pointer = null, edgeFrame = 0, hover = null;
  let simulationTime = 0, accumulator = 0, awakeUntil = 0, energy = 0;
  let width = 0, height = 0, dirty = true, frame = 0, lastTime = 0;
  let ink = null, inkDirty = true, resolution = 1, margin = 0, layerHeight = 0, anchor = NaN, cursor = '';

  // Cursor hotspot is exactly the graphite tip, so a click marks where it points.
  const pencilCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><g transform="translate(3 37) rotate(34)" stroke-linejoin="round"><path d="M-2-6v-26.5h4V-6Z" fill="#dfae2d" stroke="#a67521" stroke-width=".45"/><path d="M-.7-6v-26.5H.5V-6Z" fill="#f9d665"/><path d="M-2-6 0 0 2-6Z" fill="#debd91" stroke="#ac875c" stroke-width=".35"/><path d="M-.8-2.3 0 0 .8-2.3Z" fill="#30322d"/><path d="M-2-32.5v-3h4v3Z" fill="#b9beb7" stroke="#7f8881" stroke-width=".35"/><path d="M-1.6-33.4h3.2m-3.2-.9h3.2" stroke="#f1f1df" stroke-width=".35"/><path d="M-2-35.5v-2q2-1.3 4 0v2Z" fill="#d68d86" stroke="#ad6e69" stroke-width=".35"/><text x="-1.25" y="-17" fill="#665023" font-family="Arial,sans-serif" font-size="2.6">2</text></g></svg>`;
  const pencilUrl = `url("data:image/svg+xml,${encodeURIComponent(pencilCursor)}") 3 37, auto`;
  // A colored pencil's cursor is painted to match: body, highlight, and point.
  const shade = (hex, t) => '#' + [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t).toString(16).padStart(2, '0'); }).join('');
  function pencilCursorFor(color) {
    if (color === COLORS[0].ink) return pencilUrl;
    const tinted = pencilCursor.replace('fill="#dfae2d" stroke="#a67521"', `fill="${color}" stroke="${shade(color, -.35)}"`)
      .replace('fill="#f9d665"', `fill="${shade(color, .35)}"`).replace('fill="#30322d"', `fill="${color}"`).replace(/<text[^>]*>2<\/text>/, '');
    return `url("data:image/svg+xml,${encodeURIComponent(tinted)}") 3 37, auto`;
  }
  let pencilColor = COLORS[0].ink, pointerUrl = pencilUrl;
  // With Pin + string in hand, the pointer is a red push pin; its needle tip is the hotspot.
  const pinCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="32" viewBox="0 0 28 32"><g transform="translate(5 29) rotate(28)" stroke="#6e0d12" stroke-width=".6" stroke-linejoin="round"><path d="M-.55 0v-9.5h1.1V0Z" fill="#a9b2b6" stroke="#5a6368" stroke-width=".35"/><path d="M-6-9c0-2.6 2-4 3.4-4.5h5.2C4-13 6-11.6 6-9Z" fill="#c9181d"/><path d="M-3.3-13.5-3.7-19.5h7.4L3.3-13.5Z" fill="#d90f18"/><path d="M-5.6-19.5v-3.2h11.2v3.2Z" fill="#e5232a"/><ellipse cy="-22.7" rx="5.6" ry="1.7" fill="#ff7b6b" stroke-width=".5"/><path d="M-2.4-14.2-2.7-19" stroke="#ffd0c4" stroke-width=".7"/></g></svg>`;
  const pinUrl = `url("data:image/svg+xml,${encodeURIComponent(pinCursor)}") 5 29, crosshair`;
  // The tool's icon is the same red push pin that goes on the page.
  const pinIcon = tools.querySelector('.paper-pin-icon');
  if (pinIcon) pinIcon.src = `data:image/svg+xml,${encodeURIComponent(pinCursor)}`;
  document.documentElement.classList.add('paper-pointer');
  document.documentElement.style.setProperty('--paper-pencil-cursor',pencilUrl);
  const interactionSelector = 'a[href],button,input,textarea,select,label,summary,iframe,audio,video,canvas:not(.paper-canvas),[role="button"],[role="link"],[role="slider"],[role="switch"],[role="checkbox"],[role="tab"],[role="menuitem"],[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"]),[onclick],[data-paper-interactive],[data-frame],.banner-cta,.paper-tools,.game-overlay'; // the embed frames themselves, not the empty space beside them
  const isInteraction = target => target instanceof Element && !!target.closest(interactionSelector);
  // Browse keeps the ordinary arrow; each tool shows what it puts on the page.
  const toolCursor = () => tool==='browse'?'':tool==='eraser'?'cell':tool==='pins'?pinUrl:pointerUrl;
  function setPaperCursor(next) {
    if(cursor!==next)document.body.style.setProperty('--paper-cursor',cursor=next);
  }
  // Embedded projects retain their own native cursors, including text inputs,
  // draggable folders, and buttons. Drawing tools apply only to the paper outside.
  const hints = {
    browse: 'Scroll and click as usual. Drag existing pins to move them, or grab a string to give it a twang.',
    pencil: 'Drag to draw, click for a dot.',
    eraser: 'Drag over a line to rub it out. Undo brings it back.',
    pins: 'Click an existing pin first, then click empty paper to place a second pin and tie them together.'
  };
  // The hint beside the toolbar shows when something changes, then tucks itself away.
  let hintTimer = 0;
  function showHint(text) {
    clearTimeout(hintTimer); hint.textContent = ''; hint.hidden = true;
  }
  function invalidate() { dirty = true; if (!frame) frame = requestAnimationFrame(render); }
  function wake(seconds = 2) { awakeUntil = Math.max(awakeUntil, simulationTime + seconds); invalidate(); }
  function remember() {
    history.push({ strokes: strokes.slice(), pins: pins.map(p => ({ ...p })), links: links.map(l => l.slice()), starterCourse, restLengths: ropes.map(r=>r.restLength) });
    if (history.length > 30) history.shift();
    undoButton.disabled = false;
  }
  function controls() {
    clearButton.disabled = !strokes.length && !pins.length;
  }
  function selectTool(next) {
    if (boxToggle && next !== 'browse') setBox(true);
    if (gesture) finish(true);
    tool = next; selected = -1;
    pinTargets.style.visibility = tool === 'browse' || tool === 'pins' ? 'visible' : 'hidden';
    tools.querySelectorAll('[data-paper-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.paperTool === tool)));
    document.body.dataset.paperTool=tool;
    setPaperCursor(toolCursor());
    showHint(hints[tool]);
    wake();
  }
  function pickColor(color) {
    pencilColor = color; pointerUrl = pencilCursorFor(color);
    tools.querySelectorAll('[data-paper-color]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.paperColor === color)));
    if (tool !== 'pencil') selectTool('pencil'); else setPaperCursor(pointerUrl);
  }
  // The paper tray emerges from the box; closing waits for the reverse motion.
  function setBox(open) {
    if (boxOpen === open) return;
    const wasHidden = toolPanel.hidden;
    const current = !wasHidden ? getComputedStyle(toolPanel) : null;
    const from = current ? { opacity: current.opacity, transform: current.transform } :
      { opacity: 0, transform: 'translateY(24px) scale(.96)' };
    boxAnimation?.cancel(); boxAnimation = null;
    boxOpen = open;
    tools.classList.toggle('is-open', open);
    if (boxToggle) {
      if (!open && toolPanel.contains(document.activeElement)) boxToggle.focus({ preventScroll: true });
      boxToggle.setAttribute('aria-expanded', String(open));
      toolPanel.inert = !open;
      toolPanel.setAttribute('aria-hidden', String(!open));
      if (reduced.matches || !toolPanel.animate) { toolPanel.hidden = !open; return; }
      toolPanel.hidden = false;
      const motion = toolPanel.animate([from, open ?
        { opacity: 1, transform: 'translateY(0) scale(1)' } :
        { opacity: 0, transform: 'translateY(24px) scale(.96)' }
      ], { duration: open ? 210 : 170, easing: open ? 'cubic-bezier(.2,.75,.25,1)' : 'ease-in', fill: 'both' });
      boxAnimation = motion;
      motion.finished.then(() => {
        if (boxAnimation !== motion) return;
        toolPanel.hidden = !boxOpen;
        motion.cancel(); boxAnimation = null;
      }).catch(() => {});
    }
  }
  // Each canvas covers the viewport plus a margin above and below. Scrolling within the
  // margin needs no redraw; nearer an edge, the canvases hop to recentre (placeLayer).
  // Big screens trade margin, then resolution, to stay under Safari's canvas size cap.
  const MAX_AREA = 16e6;
  function fit(c) {
    c.width = Math.round(width * resolution); c.height = Math.round(layerHeight * resolution);
    c.style.width = `${width}px`; c.style.height = `${layerHeight}px`;
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    resolution = Math.min(devicePixelRatio || 1, 2);
    margin = Math.max(120, Math.min(Math.round(height * .5), Math.floor((MAX_AREA / (resolution * resolution * width) - height) / 2)));
    layerHeight = height + margin * 2;
    resolution = Math.min(resolution, Math.sqrt(MAX_AREA / (width * layerHeight)));
    fit(canvas); if (ink) fit(ink.canvas);
    anchor = NaN;
    if (starterCourse) { pins = starterPins(); links = starterLinks(); }
    rebuildRopes(); invalidate(); guide?.changed('resize');
  }
  // Whole steps of 8 CSS px keep the canvas on the device pixel grid at common zooms.
  const anchorFor = y => Math.max(0, Math.round((y - margin) / 8) * 8);
  const needsAnchor = () => !(Math.abs(anchorFor(scrollY) - anchor) <= margin / 2);
  function placeLayer() {
    if (!needsAnchor()) return;
    anchor = anchorFor(scrollY);
    const transform = `translateY(${anchor}px)`;
    canvas.style.transform = transform; if (ink) ink.canvas.style.transform = transform;
    inkDirty = dirty = true;
  }
  function onScroll() {
    if (needsAnchor()) invalidate();
    guide?.place();
  }
  // A pin leans according to where it sits: outward toward the page edges, with a
  // slow ripple down the page. Moving a pin therefore turns it smoothly.
  function pinTilt(p) { return Math.max(-.62, Math.min(.62, (p.x-.5)*.9 + Math.sin(p.y*.017 + p.x*7)*.28)); }
  // String is tied round the middle of a pin's stem, not at the point in the paper.
  function tie(p) { const t = pinTilt(p), d = pinWaist(t); return { x: p.x*width + Math.sin(t)*d, y: p.y - Math.cos(t)*d }; }
  function starterPins() {
    return threadHousePins(host.getBoundingClientRect(), width, scrollY);
  }
  const starterLinks = () => HOUSE_LINKS.map(link => link.slice());
  // Drawing near the top or bottom edge scrolls the page, so one line can span a long way.
  function edgeScroll() {
    edgeFrame = 0;
    if (!gesture || !pointer || (tool !== 'pencil' && tool !== 'pins' && !(tool === 'browse' && gesture.pin >= 0))) return;
    const top = 72, bottom = innerHeight - 64;
    const speed = pointer.y > bottom ? (pointer.y - bottom) / 64 : pointer.y < top ? -(top - pointer.y) / 64 : 0;
    if (speed) {
      scrollBy({ top: Math.max(-1, Math.min(1, speed)) * 16, behavior: 'instant' });
      const p = { x: pointer.x / width, y: pointer.y + scrollY };
      if (tool === 'pencil') gesture.points.push(p);
      else if (gesture.dragging) { pins[gesture.pin] = p; retract(gesture.pin); wake(); }
      invalidate();
    }
    edgeFrame = requestAnimationFrame(edgeScroll);
  }
  function point(e) { return { x: e.clientX / width, y: e.clientY + scrollY }; }
  function nearestPin(p) {
    let best=-1,distance=16;
    pins.forEach((pin,i)=>{
      const x=(p.x-pin.x)*width,y=p.y-pin.y,lean=pinTilt(pin);
      const d=Math.min(Math.hypot(x,y),Math.hypot(x-Math.sin(lean)*PIN_HEAD_REACH,y+Math.cos(lean)*PIN_HEAD_REACH));
      if(d<distance){distance=d;best=i;}
    });
    return best;
  }
  function updatePinTargets() {
    while (pinHits.length > pins.length) pinHits.pop().remove();
    pins.forEach((pin, i) => {
      let hit = pinHits[i];
      if (!hit) {
        hit = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (let j = 0; j < 2; j++) {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('r', '16');
          hit.append(circle);
        }
        pinTargets.append(hit); pinHits.push(hit);
      }
      const x = pin.x * width, lean = pinTilt(pin);
      const [stem, head] = hit.children;
      stem.setAttribute('cx', x); stem.setAttribute('cy', pin.y);
      head.setAttribute('cx', x + Math.sin(lean) * PIN_HEAD_REACH);
      head.setAttribute('cy', pin.y - Math.cos(lean) * PIN_HEAD_REACH);
    });
  }
  function rebuildRopes(preserve = false, restLengths = null) {
    const previous = ropes;
    ropes = links.map(([ia, ib], i) => {
      const a = pins[ia], b = pins[ib];
      // A rebuilt thread keeps its identity, so the guide standing on it is not dropped.
      let rope = preserve && previous[i];
      if (!rope) {
        const fresh = createRope(tie(a),tie(b));
        // Short, gently slack lengths keep the house recognizable and still springy.
        if (starterCourse) fresh.restLength = Math.hypot(tie(b).x-tie(a).x, tie(b).y-tie(a).y)*1.008+1;
        rope = previous[i] ? Object.assign(previous[i], fresh) : fresh; delete rope.retractTo;
      }
      if (restLengths?.[i]) { rope.restLength = restLengths[i]; delete rope.retractTo; }
      return rope;
    });
    controls(); wake();
  }
  // Dragging a pin back toward its neighbour reels the string in, so it stays
  // snug instead of piling up as slack. Pulling apart never lengthens it.
  function retract(index) {
    links.forEach(([ia, ib], i) => {
      if (ia !== index && ib !== index) return;
      const rope = ropes[i], a = pins[ia], b = pins[ib]; if (!rope || !a || !b) return;
      const ta = tie(a), tb = tie(b), chord = Math.hypot(tb.x-ta.x, tb.y-ta.y);
      rope.retractTo = Math.min(rope.restLength, Math.max(12, chord*1.02+2));
    });
  }
  // Threads only join pins you pick: click a pin, then another pin or an empty spot.
  function updatePinHint() {
    showHint(tool === 'pins' && selected >= 0 ? 'Pin chosen! Now click another pin, or empty paper for a new one, to tie the string. Click this pin again to cancel.' : hints[tool]);
  }
  // Returns true when the click ran a new string.
  function clickPin(i) {
    let linked = false;
    if (selected < 0) selected = i;
    else if (selected === i) selected = -1;
    else {
      if (!links.some(([a, b]) => (a === selected && b === i) || (a === i && b === selected))) {
        remember(); starterCourse = false; links.push([selected, i]); rebuildRopes(true); linked = true;
      }
      selected = -1;
    }
    updatePinHint();
    return linked;
  }
  function erase(p) {
    // Test segments too, so sparse pointer samples do not leave gaps in erasing.
    const near = (a, b) => {
      const ax = a.x*width, bx = b.x*width, px = p.x*width;
      const dx = bx-ax, dy = b.y-a.y, length = dx*dx+dy*dy;
      const t = length ? Math.max(0, Math.min(1, ((px-ax)*dx+(p.y-a.y)*dy)/length)) : 0;
      return Math.hypot(px-ax-t*dx, p.y-a.y-t*dy) < 16;
    };
    const kept = strokes.filter(s => !s.points.some((a,i) => near(a,s.points[Math.max(0,i-1)])));
    if (kept.length !== strokes.length) {
      if (!gesture.changed) { remember(); gesture.changed = true; }
      strokes = kept; inkDirty = true; controls(); invalidate(); guide?.changed('erase');
    }
  }
  // In Browse, the strings can still be grabbed and twanged: the nearest bead of string
  // follows the hand (a little way) and springs back when let go.
  function nearestRope(p) {
    let best = null, distance = 14;
    const px = p.x*width;
    for (const rope of ropes) {
      const nodes = rope.nodes, last = nodes.length - 1;
      for (let i = 0; i < last; i++) {
        const a = nodes[i], b = nodes[i+1], dx = b.x-a.x, dy = b.y-a.y, len = dx*dx+dy*dy;
        const t = len ? Math.max(0, Math.min(1, ((px-a.x)*dx+(p.y-a.y)*dy)/len)) : 0, d = Math.hypot(px-a.x-t*dx, p.y-a.y-t*dy);
        // Hold the bead nearest the grab, but never an end: those are tied to pins.
        if (d < distance) { distance = d; const k = Math.max(1, Math.min(last-1, t < .5 ? i : i+1)); best = { rope, i: k, x: nodes[k].x, y: nodes[k].y }; }
      }
    }
    return best;
  }
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || gesture || isInteraction(e.target) || document.body.classList.contains('no-scroll')) return;
    const p = point(e);
    const pin = tool === 'browse' ? nearestPin(p) : -1;
    const pluck = tool === 'browse' && pin < 0 && nearestRope(p);
    if (tool === 'browse' && pin < 0 && !pluck) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    gesture = { id: e.pointerId, start: p, changed: false, points: [p], pin: -1, pluck };
    if (pluck) { pluck.rope.hold = { i: pluck.i, x: pluck.x, y: pluck.y }; setPaperCursor('grabbing'); wake(); }
    else if (tool === 'pins' || tool === 'browse') {
      gesture.pin = tool === 'browse' ? pin : nearestPin(p); gesture.dragging = false;
      if (tool === 'pins' && gesture.pin < 0) {
        // Empty paper: drop a pin. If one is selected, a thread runs to it from there.
        remember(); gesture.changed = true; gesture.dragging = true; starterCourse = false;
        pins.push(p); gesture.pin = pins.length - 1;
        if (selected >= 0) { links.push([selected, gesture.pin]); selected = gesture.pin; gesture.made = 'string'; }
        rebuildRopes(true); updatePinHint();
      }
      setPaperCursor('grabbing');
    } else if (tool === 'eraser') erase(p);
    invalidate();
  },{capture:true});
  document.addEventListener('pointermove', e => {
    if (!gesture) {
      const p = point(e);
      setPaperCursor(isInteraction(e.target) ? (tool==='browse'?'':pointerUrl) : tool==='pins' ? (nearestPin(p)>=0?'grab':pinUrl) : tool==='browse' && (nearestPin(p)>=0 || nearestRope(p)) ? 'grab' : toolCursor());
      // A chosen pin shows where its string would go before the second click.
      if (tool === 'pins' && selected >= 0) { hover = p; invalidate(); }
    }
    if (!gesture || gesture.id !== e.pointerId) return;
    if (gesture.pluck) {
      const { rope, i, x, y } = gesture.pluck, dx = e.clientX - gesture.start.x*width, dy = point(e).y - gesture.start.y, reach = Math.min(1, 160 / (Math.hypot(dx, dy) || 1));
      rope.hold = { i, x: x + dx*reach, y: y + dy*reach }; wake(); return;
    }
    pointer = { x: e.clientX, y: e.clientY };
    if (!edgeFrame) edgeFrame = requestAnimationFrame(edgeScroll);
    if (tool === 'pencil') {
      const samples = e.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [e]) {
        const p = point(sample), prev = gesture.points.at(-1);
        if (Math.hypot((p.x-prev.x)*width,p.y-prev.y) > .8) gesture.points.push(p);
      }
      guide?.blockWithInk(gesture.points);
    } else if ((tool === 'pins' || tool === 'browse') && gesture.pin >= 0) {
      const p = point(e);
      if (!gesture.dragging && Math.hypot((p.x-gesture.start.x)*width, p.y-gesture.start.y) > 5) { remember(); gesture.changed = true; gesture.dragging = true; starterCourse = false; }
      if (gesture.dragging) { pins[gesture.pin] = p; retract(gesture.pin); wake(); }
    }
    else if (tool === 'eraser') {
      const p = point(e), prev = gesture.points.at(-1);
      const steps = Math.ceil(Math.hypot((p.x-prev.x)*width,p.y-prev.y)/8);
      for (let i=1;i<=steps;i++) erase({x:prev.x+(p.x-prev.x)*i/steps,y:prev.y+(p.y-prev.y)*i/steps});
      gesture.points.push(p);
    }
    invalidate();
  },{capture:true});
  function finish(cancelled = false) {
    if (!gesture) return;
    if (gesture.pluck) {
      const { rope, x, y } = gesture.pluck, h = rope.hold;
      if (h && !cancelled) guide?.launch(rope, h.x - x, h.y - y);
      delete rope.hold;
      const id = gesture.id; gesture = null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      setPaperCursor(toolCursor()); wake(); return;
    }
    let made = cancelled ? null : gesture.made;
    if (cancelled && gesture.changed) {
      const previous = history.pop(); strokes = previous.strokes; starterCourse = previous.starterCourse;
      pins = starterCourse ? starterPins() : previous.pins; links = starterCourse ? starterLinks() : previous.links; selected = -1;
      undoButton.disabled = !history.length; rebuildRopes(false,previous.restLengths);
    } else if (!cancelled && tool === 'pencil') {
      remember();
      let minY = Infinity, maxY = -Infinity;
      for (const p of gesture.points) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      strokes.push({ points: gesture.points, minY, maxY, color: pencilColor }); made = 'stroke';
    } else if (!cancelled && tool === 'pins' && gesture.pin >= 0 && !gesture.dragging && clickPin(gesture.pin)) made = 'string';
    cancelAnimationFrame(edgeFrame); edgeFrame = 0; inkDirty = true;
    const id = gesture.id; gesture = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    setPaperCursor(toolCursor());
    controls(); wake(); guide?.changed('edit');
    if (made) guide?.notice(made);
  }
  document.addEventListener('pointerup', e => { if (gesture?.id === e.pointerId) finish(); },{capture:true});
  document.addEventListener('pointercancel', () => finish(true),{capture:true});
  canvas.addEventListener('lostpointercapture', () => finish(true));
  function releaseKeys() { wake(); }
  addEventListener('blur', () => { finish(true); releaseKeys(); });
  tools.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.paperHelp) { guide?.tip(b.dataset.paperHelp, b); return; }
    if (b.dataset.paperColor) pickColor(b.dataset.paperColor);
    else if (b.dataset.paperTool) selectTool(b.dataset.paperTool);
    else action(b.dataset.paperAction);
  });
  function action(name) {
    if (gesture) finish();
    if (name === 'undo' && history.length) {
      const previous = history.pop(); strokes = previous.strokes; starterCourse = previous.starterCourse;
      pins = starterCourse ? starterPins() : previous.pins; links = starterCourse ? starterLinks() : previous.links; selected = -1;
      undoButton.disabled = !history.length; rebuildRopes(false,previous.restLengths);
    } else if (name === 'clear' && (strokes.length || pins.length)) {
      remember(); strokes = []; pins = []; links = []; selected = -1; starterCourse = false; rebuildRopes();
      showHint('A fresh sheet. Undo restores your previous page.');
    }
    inkDirty = true; controls(); invalidate(); guide?.changed('edit');
  }
  addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select,[contenteditable="true"]') || document.body.classList.contains('no-scroll')) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); action('undo'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const next = { d: 'pencil', e: 'eraser', t: 'pins', v: 'browse', escape: 'browse' }[key];
    if (next) { selectTool(next); if (key === 'escape') setBox(false); }
  });

  // The document span the canvases currently cover; anything outside is skipped.
  const inView = (top, bottom, pad) => bottom >= anchor - pad && top <= anchor + layerHeight + pad;
  function drawStroke(ctx, s) {
    if (!inView(s.minY, s.maxY, 4)) return;
    const ps = s.points;
    ctx.strokeStyle = ctx.fillStyle = s.color || COLORS[0].ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (ps.length === 1) { ctx.beginPath(); ctx.arc(ps[0].x*width,ps[0].y,1.4,0,Math.PI*2); ctx.fill(); return; }
    ctx.lineWidth = 1.6; ctx.globalAlpha = .78; ctx.beginPath(); ctx.moveTo(ps[0].x*width,ps[0].y);
    for (let i=1;i<ps.length-1;i++) ctx.quadraticCurveTo(ps[i].x*width,ps[i].y,(ps[i].x+ps[i+1].x)*width/2,(ps[i].y+ps[i+1].y)/2);
    const last = ps.at(-1); ctx.lineTo(last.x*width,last.y); ctx.stroke();
    ctx.globalAlpha = .2; ctx.lineWidth = .65; ctx.translate(.7,-.45); ctx.stroke(); ctx.translate(-.7,.45); ctx.globalAlpha = 1;
  }
  // Finished strokes get their own canvas, made on the first one and redrawn only when
  // they change, so the animation loop never re-inks a page full of drawing.
  function drawInk() {
    inkDirty = false;
    if (!ink && strokes.length) {
      const c = document.createElement('canvas');
      c.className = 'paper-canvas'; c.setAttribute('aria-hidden', 'true');
      fit(c); c.style.transform = canvas.style.transform; layer.prepend(c);
      ink = c.getContext('2d');
    }
    if (!ink) return;
    ink.setTransform(1,0,0,1,0,0); ink.clearRect(0,0,ink.canvas.width,ink.canvas.height);
    ink.setTransform(resolution,0,0,resolution,0,-anchor*resolution);
    for (const s of strokes) drawStroke(ink, s);
  }
  // A dashed red line from the chosen pin to the pointer: where the string will go.
  function drawPreview(from, to) {
    const a = tie(from);
    ctx.save(); ctx.strokeStyle = '#c9181d'; ctx.globalAlpha = .55; ctx.lineWidth = 1.6; ctx.setLineDash([5, 5]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(to.x*width, to.y); ctx.stroke(); ctx.restore();
  }
  // A ring around the head of the pin a new thread will start from.
  function drawSelected(p) {
    if (document.body.classList.contains('paper-tools-practice')) return;
    const y = p.y; if (!inView(y, y, 60)) return;
    const lean = pinTilt(p), cx = p.x*width + Math.sin(lean)*PIN_HEAD_REACH, cy = y - Math.cos(lean)*PIN_HEAD_REACH;
    ctx.save(); ctx.strokeStyle = '#8a3a2c'; ctx.lineWidth = 1.3; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI*2); ctx.stroke(); ctx.restore();
  }
  const sprites = new Map();
  function drawPin(p) {
    const x=p.x*width, y=p.y;
    if (!inView(y, y, 50)) return;
    const scale=Math.max(2,Math.min(devicePixelRatio||1,2)*1.5), step=Math.round(pinTilt(p)*90/Math.PI);
    const key=`${step}@${scale}`;
    let sprite=sprites.get(key);
    if(!sprite){sprite=pinSprite(step*Math.PI/90,scale);sprites.set(key,sprite);}
    ctx.drawImage(sprite.canvas,x-sprite.ox,y-sprite.oy,sprite.w,sprite.h);
  }
  // Smooth the particle chain visually while leaving its constraints intact.
  function smoothCord(physical) {
    const last=physical.length-1, nodes=[];
    for(let i=0;i<last;i++) {
      const a=physical[Math.max(0,i-1)],b=physical[i],c=physical[i+1],d=physical[Math.min(last,i+2)];
      for(let j=0;j<4;j++) {
        const t=j/4,t2=t*t,t3=t2*t;
        nodes.push({
          x:.5*(2*b.x+(-a.x+c.x)*t+(2*a.x-5*b.x+4*c.x-d.x)*t2+(-a.x+3*b.x-3*c.x+d.x)*t3),
          y:.5*(2*b.y+(-a.y+c.y)*t+(2*a.y-5*b.y+4*c.y-d.y)*t2+(-a.y+3*b.y-3*c.y+d.y)*t3)
        });
      }
    }
    nodes.push(physical[last]);
    return nodes;
  }
  // True when no node has moved since the string was last drawn; otherwise notes where they are now.
  function ropeStill(rope) {
    const nodes=rope.nodes, seen=rope.seen;
    let still=!!seen && seen.length===nodes.length*2 && rope.seenRest===rope.restLength;
    for(let i=0;still&&i<nodes.length;i++) still=Math.abs(nodes[i].x-seen[i*2])<.02&&Math.abs(nodes[i].y-seen[i*2+1])<.02;
    if(still)return true;
    rope.seen=new Float64Array(nodes.length*2); rope.seenRest=rope.restLength;
    nodes.forEach((p,i)=>{rope.seen[i*2]=p.x;rope.seen[i*2+1]=p.y;});
    return false;
  }
  // A string at rest is drawn once into its own small canvas and stamped from there,
  // so only strings that are actually moving cost a full redraw each frame.
  function stampRope(rope, nodes) {
    let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
    for(const p of nodes){if(p.x<l)l=p.x;if(p.x>r)r=p.x;if(p.y<t)t=p.y;if(p.y>b)b=p.y;}
    const pad=12, left=Math.floor((l-pad)*resolution), top=Math.floor((t-pad-anchor)*resolution);
    const w=Math.ceil((r+pad)*resolution)-left, h=Math.ceil((b+pad-anchor)*resolution)-top;
    if(w*h>4e6)return null;
    const c=rope.stampCanvas??=document.createElement('canvas');
    c.width=w; c.height=h;
    const g=c.getContext('2d');
    g.setTransform(resolution,0,0,resolution,-left,-top-anchor*resolution);
    drawCord(g,nodes,rope.restLength);
    return {canvas:c,left,top,anchor,resolution};
  }
  function drawRopes() {
    for (const rope of ropes) {
      let top=Infinity, bottom=-Infinity;
      for (const p of rope.nodes) { if (p.y<top) top=p.y; if (p.y>bottom) bottom=p.y; }
      if (!inView(top,bottom,15)) continue;
      if (!ropeStill(rope)) { rope.stamp=null; drawCord(ctx,smoothCord(rope.nodes),rope.restLength); continue; }
      let s=rope.stamp;
      if (!s || s.anchor!==anchor || s.resolution!==resolution) s=rope.stamp=stampRope(rope,smoothCord(rope.nodes));
      if (!s) { drawCord(ctx,smoothCord(rope.nodes),rope.restLength); continue; }
      ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(s.canvas,s.left,s.top);
      ctx.setTransform(resolution,0,0,resolution,0,-anchor*resolution);
    }
  }
  // Physics steps at a fixed 120 Hz; drawing blends the last two steps so the string
  // and the guide move evenly on 60, 90, or 144 Hz screens alike.
  function blendRopes(alpha) {
    for (const rope of ropes) for (const n of rope.nodes) {
      n.sx=n.x; n.sy=n.y; n.x=n.px+(n.x-n.px)*alpha; n.y=n.py+(n.y-n.py)*alpha;
    }
  }
  function unblendRopes() {
    for (const rope of ropes) for (const n of rope.nodes) { n.x=n.sx; n.y=n.sy; }
  }
  function simulate(dt) {
    const foot = guide?.step(dt) ?? null; energy = 0;
    for(let i=0;i<ropes.length;i++) {
      const [ia,ib]=links[i],a=pins[ia],b=pins[ib];
      const load=foot?.rope===ropes[i]?{u:foot.u,force:6400}:null;
      if(ropes[i].retractTo<ropes[i].restLength) {
        const rope=ropes[i];
        rope.restLength+=(rope.retractTo-rope.restLength)*(1-Math.exp(-dt*18));
        if(rope.restLength-rope.retractTo<.05){rope.restLength=rope.retractTo;delete rope.retractTo;}
      }
      energy+=stepRope(ropes[i],tie(a),tie(b),dt,load,reduced.matches);
    }
    simulationTime+=dt;
  }
  // "Draw it for me": the guide's line draws itself in, a pencil at its tip, then becomes
  // an ordinary graphite stroke that can be undone or erased like any other.
  const pencilImage = new Image();
  pencilImage.src = `data:image/svg+xml,${encodeURIComponent(pencilCursor)}`;
  let sketching = null;
  function sketch(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x-points[i-1].x, points[i].y-points[i-1].y);
    sketching = { points: points.map(p => ({ x: p.x / width, y: p.y })), start: performance.now(), duration: Math.min(1800, Math.max(600, length / .7)) };
    invalidate();
  }
  function commitSketch() {
    const ps = sketching.points; sketching = null;
    let minY = Infinity, maxY = -Infinity;
    for (const p of ps) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    remember(); strokes.push({ points: ps, minY, maxY, color: COLORS[0].ink }); inkDirty = true;
    controls(); wake(); guide?.changed('edit');
  }
  // The part drawn so far: slow to start and finish, quick in the middle, like a hand.
  function sketched(now) {
    const t = Math.min(1, (now - sketching.start) / sketching.duration), eased = t < .5 ? 2*t*t : 1 - 2*(1-t)**2;
    return sketching.points.slice(0, Math.max(2, Math.ceil(eased * sketching.points.length)));
  }
  function render(now) {
    frame=0;
    const dt=lastTime?Math.min((now-lastTime)/1000,.05):0; lastTime=now;
    const visible = !document.hidden && !document.body.classList.contains('no-scroll');
    if (visible) {
      accumulator+=dt;
      while(accumulator>=1/120) {simulate(1/120);accumulator-=1/120;}
      dirty=true;
      guide?.follow(dt);
    }
    if (sketching && now >= sketching.start + sketching.duration) commitSketch();
    placeLayer();
    if (inkDirty) drawInk();
    if (dirty) {
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.setTransform(resolution,0,0,resolution,0,-anchor*resolution);
      if (gesture && tool==='pencil') drawStroke(ctx,{points:gesture.points,minY:-Infinity,maxY:Infinity,color:pencilColor});
      const partial = sketching && sketched(now);
      if (partial) drawStroke(ctx,{points:partial,minY:-Infinity,maxY:Infinity,color:COLORS[0].ink});
      const alpha=Math.min(1,accumulator*120);
      blendRopes(alpha);
      try { drawRopes(); guide?.draw(ctx,alpha,inView); } finally { unblendRopes(); }
      pins.forEach(drawPin);
      updatePinTargets();
      for (const i of new Set(links.flat())) { const p = pins[i]; if (p && inView(p.y, p.y, 40)) { const t = tie(p); drawKnot(ctx, t.x, t.y, pinTilt(p)); } }
      if (selected >= 0 && pins[selected]) { drawSelected(pins[selected]); if (tool === 'pins' && hover && !gesture) drawPreview(pins[selected], hover); }
      if (partial) { const tip = partial.at(-1); ctx.drawImage(pencilImage, tip.x*width-3, tip.y-37, 32, 40); }
      dirty=false;
    }
    // Anything that woke the loop during this frame (the guide wakes it from inside his
    // step) has already asked for the next one; asking again would start a second loop,
    // and every frame of walking would double them until the page crawls.
    if (!frame && visible && (simulationTime<awakeUntil || energy>.004 || guide?.busy() || gesture?.pin>=0 || sketching)) frame=requestAnimationFrame(render);
    // Asleep: the next wake starts the clock fresh instead of catching up 50 ms in one lurch.
    if (!frame) lastTime = 0;
  }
  // A phone's address bar sliding away only changes the height a little; the margin
  // already covers that, so skip reallocating the canvases mid-scroll.
  addEventListener('resize',() => { if (innerWidth !== width || Math.abs(innerHeight - height) > margin / 2) resize(); });
  addEventListener('scroll',onScroll,{passive:true});
  addEventListener('paper:layout',()=>guide?.changed('resize'));
  document.addEventListener('visibilitychange',()=>{lastTime=0;releaseKeys();});
  new MutationObserver(releaseKeys).observe(document.body,{attributes:true,attributeFilter:['class']});
  resize();
  guide = createGuide({
    host, reduced, tool: () => tool,
    ropes: () => ropes, pins: () => pins, strokes: () => strokes, width: () => width,
    wake, invalidate, selectTool, setBox, sketch,
    // The finale's band: two pins with a string tied between them (undoable like any other).
    slingshot: (a, b) => {
      if (gesture) finish(true);
      remember(); starterCourse = false;
      pins.push({ x: a.x / width, y: a.y }, { x: b.x / width, y: b.y });
      links.push([pins.length - 2, pins.length - 1]); rebuildRopes(true);
      return ropes.at(-1);
    },
    // His cape: the triangle drawn for him comes off the page as he puts it on (undoable).
    take: list => {
      if (!list.some(s => strokes.includes(s))) return;
      remember(); strokes = strokes.filter(s => !list.includes(s));
      inkDirty = true; controls(); invalidate(); guide?.changed('edit');
    },
    kick: (rope, u, impulse) => kickRope(rope, u, impulse)
  });
  controls();
  new ResizeObserver(() => {
    if (starterCourse) { pins = starterPins(); rebuildRopes(); }
    guide?.changed('resize');
  }).observe(host);
  // Everyone begins in Browse so scrolling and project links work immediately.
  selectTool('browse');
  reduced.addEventListener('change',()=>{releaseKeys();});
})();
