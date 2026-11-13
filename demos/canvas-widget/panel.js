// ─── CONSTANTS ───
const COLORS = ['#8C1D40','#FFC627','#78BE20','#00A3E0','#FF7F32','#E74973','#AF674B'];

const GPA_SCALE_DEFAULT = [
  {l:'A+',min:97,max:100,pts:4.33},{l:'A',min:94,max:96.99,pts:4.0},
  {l:'A-',min:90,max:93.99,pts:3.67},{l:'B+',min:87,max:89.99,pts:3.33},
  {l:'B',min:84,max:86.99,pts:3.0},{l:'B-',min:80,max:83.99,pts:2.67},
  {l:'C+',min:77,max:79.99,pts:2.33},{l:'C',min:70,max:76.99,pts:2.0},
  {l:'D',min:60,max:69.99,pts:1.0},{l:'E',min:0,max:59.99,pts:0.0}
];

// ─── STORAGE ───
// Mode preference: an explicit user choice (saved) wins; otherwise follow the
// demo starts in light mode.
function loadMode() {
  try {
    const saved = localStorage.getItem('ss_mode');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch(e){}
  return 'light';
}
function saveMode(m) {
  try { localStorage.setItem('ss_mode',m); } catch(e){}
  // Mirror into extension storage so content.js can darken the whole Canvas
  // page to match (cc2_mode is read by every tab's content script).
  try { chrome.storage.local.set({ cc2_mode: m }); } catch(e){}
}
// First day of week (0=Sunday…6=Saturday, matching Date.getDay()). Panel-only
// rendering preference, so plain localStorage is enough — no chrome.storage
// mirror needed (unlike cc2_mode, nothing outside the panel reads it).
function loadWeekStart() {
  try {
    const saved = parseInt(localStorage.getItem('ss_week_start'), 10);
    if (saved >= 0 && saved <= 6) return saved;
  } catch(e){}
  return 0; // Sunday — the dominant US calendar convention
}
function saveWeekStart(d) {
  try { localStorage.setItem('ss_week_start', String(d)); } catch(e){}
}
// Visual theme (structural palette/shape/font — independent of accent color
// and dark/light mode). Mirrored into chrome.storage.local like cc2_mode so
// it survives a full Chrome restart even though the iframe's localStorage is
// partitioned per embedding context.
const VISUAL_THEMES = ['sleek', 'nature', 'tech', 'racing', 'orbit'];
const TREE_SPECIES = ['oak', 'birch', 'cherry'];
const NATURE_MATERIALS = ['rose', 'log', 'cactus', 'coral', 'pond', 'tulip'];
function normalizeVisualTheme(value){ return value==='bulky'||value==='geometric'?'racing':value; }
function previewVisualTheme(){
  try { const theme=normalizeVisualTheme(new URLSearchParams(location.search).get('previewTheme')); return isVisualTheme(theme)?theme:null; } catch(e){ return null; }
}
function isVisualTheme(value) { return VISUAL_THEMES.includes(value); }
function isTreeSpecies(value) { return TREE_SPECIES.includes(value); }
function isNatureMaterial(value) { return NATURE_MATERIALS.includes(value); }
// Lavender shipped before the Netherlands-inspired tulip field replaced it.
// Normalize the old persisted value instead of making a student's selected
// course material jump to whichever fallback happens to occupy that index.
function normalizeNatureMaterial(value, fallbackIndex=0) {
  if (value === 'lavender') return 'tulip';
  return isNatureMaterial(value) ? value : natureRingMaterial(fallbackIndex);
}
function loadTheme() {
  const preview=previewVisualTheme();
  if(preview) return preview;
  const defaultTheme=typeof document!=='undefined'?document.documentElement.dataset.defaultTheme:null;
  if(isVisualTheme(defaultTheme)) return defaultTheme;
  try {
    const saved = localStorage.getItem('ss_theme');
    const theme=normalizeVisualTheme(saved);
    if (isVisualTheme(theme)){
      if(theme!==saved)localStorage.setItem('ss_theme',theme);
      return theme;
    }
  } catch(e){}
  return 'sleek';
}
function saveTheme(t) {
  if (!isVisualTheme(t)) return;
  try { localStorage.setItem('ss_theme', t); } catch(e){}
  try { chrome.storage.local.set({ cc2_theme: t }); } catch(e){}
}
// Global tree-species pick for the Nature theme's bar chart (one picker for
// the whole chart, not per-course) — same dual-storage pattern as theme.
function loadTreeSpecies() {
  try {
    const saved = localStorage.getItem('ss_tree_species');
    if (isTreeSpecies(saved)) return saved;
  } catch(e){}
  return 'oak';
}
function saveTreeSpecies(s) {
  if (!isTreeSpecies(s)) return;
  try { localStorage.setItem('ss_tree_species', s); } catch(e){}
  try { chrome.storage.local.set({ cc2_tree_species: s }); } catch(e){}
}

// ─── STATE ───
const state = {
  activeTab: null, // launch on the overview; content opens after a tab click
  panelFocused: false, // tab clicks open content across the full widget
  origin: '', // Canvas origin, e.g. "https://canvas.asu.edu" — set by canvas-data.js's applyCanvasData
  accentColor: '#00A3E0',
  mode: loadMode(),
  theme: loadTheme(), // 'sleek'|'racing'|'nature'|'tech'|'orbit' — structural look, independent of accentColor/mode
  treeSpecies: loadTreeSpecies(), // 'oak'|'birch'|'cherry' — Nature theme's tree-bar chart only
  weekStart: loadWeekStart(), // 0=Sunday…6=Saturday
  chartStyle: 'rings',
  chartVisible: true, // 'rings' or 'bars'
  sortMode: 'due',     // 'due' or 'course'
  gradeTrendCourseId: null, // dedicated Grades-tab chart view
  gradeMenuCourseId: null,  // currently open per-course overflow menu
  courses: [],
  assignments: [],
};
// Seed the page-dark mirror on every panel load, not just on toggle — tabs
// without a panel (Modules, Quizzes, ...) rely on the stored value.
saveMode(state.mode);

// ─── HELPERS ───
function isGold(c){return c&&c.toUpperCase()==='#FFC627';}
function tagText(c){return isGold(c)?'#111':'#fff';}
// For text display — gold gets darkened for legibility, others unchanged
function textColor(c){return isGold(c)?'#C49A00':c;}
// Low-opacity wash of a course's own accent color for stat-box backgrounds,
// instead of a flat neutral gray — hex+alpha (8-digit hex), works in Chrome.
function statTint(c){return `background:${c}12;border-color:${c}30`;}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function scaleFor(c){return c.customScale||GPA_SCALE_DEFAULT;}
function pctToLetter(p,scale){const s=scale||GPA_SCALE_DEFAULT;for(const g of s)if(p>=g.min)return g.l;return 'E';}
function pctToPts(p,scale){const s=scale||GPA_SCALE_DEFAULT;for(const g of s)if(p>=g.min)return g.pts;return 0;}
// Canvas applies the instructor's real grading scheme, so its own letter
// (enrollment current_grade) beats one derived from the default / syllabus-parsed
// scale. Falls back to the scale only when Canvas returns no letter.
function canvasLetter(c){const m=String(c.gradeLabel||'').trim().match(/^([A-Fa-f])([+-])?$/);return m?m[1].toUpperCase()+(m[2]||''):null;}
function courseLetter(c,scale){
  if(c.grade===null)return 'N/A';
  return canvasLetter(c)||pctToLetter(parseFloat(c.grade),scale||scaleFor(c));
}
function courseLetterPts(c,scale){
  const sc=scale||scaleFor(c),cl=canvasLetter(c);
  if(cl){const e=sc.find(g=>g.l===cl)||GPA_SCALE_DEFAULT.find(g=>g.l===cl);if(e)return e.pts;}
  return pctToPts(parseFloat(c.grade),sc);
}

function getDays(d){
  if(!d)return null;
  const key=String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const due=key?new Date(Number(key[1]),Number(key[2])-1,Number(key[3])):new Date(d),now=new Date();
  return (Date.UTC(due.getFullYear(),due.getMonth(),due.getDate())-
    Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000;
}
function fmtDue(d,done){
  if(!d||done)return{label:'',cls:''};
  const days=getDays(d);
  if(days<0)return{label:Math.abs(days)+'d overdue',cls:'overdue'};
  if(days===0)return{label:'Due today',cls:'today'};
  if(days<=2)return{label:'Due in '+days+'d',cls:'soon'};
  return{label:'Due in '+days+'d',cls:''};
}

// The calendar week containing refDate (a Date; defaults to today), starting
// on weekStartDay (0=Sunday…6=Saturday). All math uses local calendar
// components — never new Date('YYYY-MM-DD'), which parses as UTC midnight and
// lands on the wrong local day west of Greenwich. start/end come back as
// zero-padded 'YYYY-MM-DD' strings so they compare lexicographically against
// assignment due dates (canvas-data.js stores due the same way).
function getWeekRange(weekStartDay, refDate){
  const ref = refDate || new Date();
  const back = (ref.getDay() - weekStartDay + 7) % 7;
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - back);
  const end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const iso = dt => dt.getFullYear() + '-' +
    String(dt.getMonth()+1).padStart(2,'0') + '-' +
    String(dt.getDate()).padStart(2,'0');
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = dt => MONTHS[dt.getMonth()] + ' ' + dt.getDate();
  return { start: iso(start), end: iso(end), display: fmt(start) + ' – ' + fmt(end) };
}

// ─── MODE ───
// Gradient angle convention (conic-gradient "from Xdeg"):
// Dark mode:  active color (white) points upper-LEFT → angle = 225deg
//             gradient: from 225deg, white 180deg, grey 180deg
//             white occupies the upper-left quadrant
// Light mode: active color (white) also upper-LEFT → same position
//             but the identity of "dark half" and "light half" swaps
//             from 225deg, grey 180deg, white 180deg
//
// Rotating from dark→light means spinning the angle 180deg forward (225→405=45)
// so the halves swap while staying geometrically pointed left.
// We animate this in JS so the gradient stays at its final angle permanently.

// Tracks current gradient start angle
let modeAngle = loadMode()==='light' ? 45 : 225; // 225=dark (white upper-left), 45=light (grey upper-left)

function modeGradient(angleDeg){
  return `conic-gradient(from ${angleDeg}deg, #555555 180deg, #ffffff 180deg)`;
}

function applyMode(m){
  document.documentElement.setAttribute('data-mode', m);
  const btn=document.getElementById('mode-btn');
  if(btn){
    btn.style.setProperty('--mode-disc',modeGradient(modeAngle));
    btn.setAttribute('aria-label',`Switch to ${m==='dark'?'light':'dark'} mode`);
    btn.title=btn.getAttribute('aria-label');
  }
}

function toggleMode(){
  const btn=document.getElementById('mode-btn');
  const targetMode = state.mode==='dark' ? 'light' : 'dark';
  const startAngle = modeAngle;
  const duration = 380;
  const start = performance.now();

  // Apply the mode change INSTANTLY — don't wait for animation (the panel crossfades to it)
  state.mode = targetMode;
  saveMode(state.mode);
  if(btn){btn.setAttribute('aria-label',`Switch to ${targetMode==='dark'?'light':'dark'} mode`);btn.title=btn.getAttribute('aria-label');}
  crossfade(() => document.documentElement.setAttribute('data-mode', state.mode));

  // Then animate only the button gradient rotation
  function animate(now){
    const t = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    const angle = startAngle + 180 * ease;
    if(btn) btn.style.setProperty('--mode-disc',modeGradient(angle));
    if(t < 1){
      requestAnimationFrame(animate);
    } else {
      modeAngle = (startAngle + 180) % 360;
      if(btn) btn.style.setProperty('--mode-disc',modeGradient(modeAngle));
    }
  }
  requestAnimationFrame(animate);
}

// Swaps the whole panel's look with a short crossfade instead of a hard cut
// (view transitions where the browser has them, an instant swap otherwise).
function crossfade(update){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A skipped transition (hidden page, or another switch mid-fade) still applies the
  // change; only its ready promise rejects, so swallow that instead of logging an error.
  if(document.startViewTransition && !reduce) document.startViewTransition(update).ready.catch(()=>{});
  else update();
}

// ─── ACCENT ───
// persist=true only for real user picks — startup/restore calls must NOT
// save, or applying the default at boot clobbers the stored choice before
// the async restore reads it (that bug ate the saved color on every load).
function setAccent(color, persist){
  state.accentColor=color;
  document.documentElement.style.setProperty('--accent',color);
  document.documentElement.style.setProperty('--btn-text',isGold(color)?'#111':'#fff');
  const ib=document.getElementById('theme-icon-btn');
  if(ib) ib.style.setProperty('--accent-swatch',color);
  document.querySelectorAll('.th-swatch').forEach(s=>{s.classList.toggle('active',s.dataset.color===color);s.setAttribute('aria-pressed',String(s.dataset.color===color));});
  // Extension storage, not localStorage — the iframe's localStorage is
  // partitioned per embedding context and doesn't survive new windows.
  if(persist){try{chrome.storage.local.set({cc2_accent:color});}catch(e){}}
}
function setControlPopupOpen(popupId,buttonId,open){
  const popup=document.getElementById(popupId),button=document.getElementById(buttonId);
  const returnFocus=!open&&popup&&popup.contains(document.activeElement);
  if(popup)popup.classList.toggle('open',open);
  if(button){button.setAttribute('aria-expanded',String(open));if(returnFocus)button.focus();}
}
function toggleThemePopup(){
  const popup=document.getElementById('theme-popup');
  setControlPopupOpen('theme-popup','theme-icon-btn',!(popup&&popup.classList.contains('open')));
}
document.addEventListener('click',e=>{
  const w=document.getElementById('theme-wrap');
  if(w&&!w.contains(e.target))setControlPopupOpen('theme-popup','theme-icon-btn',false);
  const ww=document.getElementById('week-wrap');
  if(ww&&!ww.contains(e.target))setControlPopupOpen('week-popup','week-icon-btn',false);
  const sw=document.getElementById('style-wrap');
  if(sw&&!sw.contains(e.target))setStylePopupOpen(false);
});

// ─── VISUAL THEME (Sleek/Geometric/Nature/Tech — structural, not accent color) ───
function setStylePopupOpen(open){
  setControlPopupOpen('style-popup','style-icon-btn',open);
}
function toggleStylePopup(){
  const popup=document.getElementById('style-popup');
  setStylePopupOpen(!(popup&&popup.classList.contains('open')));
}
function syncStyleButtons(){
  document.querySelectorAll('.style-opt-btn').forEach(b=>{
    const active=b.dataset.style===state.theme;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  syncStyleButtons();
  syncTreeSpeciesVisibility();
  syncTechScrollGradient();
}
function setTheme(t){
  t=normalizeVisualTheme(t);
  if(!isVisualTheme(t)) return;
  state.theme=t;
  saveTheme(t);
  setStylePopupOpen(false);
  crossfade(()=>{
    applyTheme(t);
    drawRings();
    drawBars();
    renderGrades();
    renderHero();
  });
}
// The species picker only makes sense for Nature's tree bar chart — hidden
// for every other theme/chart-style combination.
function syncTreeSpeciesVisibility(){
  const row=document.getElementById('tree-species-row');
  if(!row) return;
  row.style.display = (state.theme==='nature' && state.chartStyle==='bars') ? 'block' : 'none';
}
function setTreeSpecies(s){
  if(!isTreeSpecies(s)) return;
  state.treeSpecies=s;
  saveTreeSpecies(s);
  const sel=document.getElementById('tree-species-select');
  if(sel) sel.value=s;
  if(state.theme==='nature') drawBars();
}

// ─── WEEK START (first day of week picker) ───
function toggleWeekPopup(){
  const popup=document.getElementById('week-popup');
  setControlPopupOpen('week-popup','week-icon-btn',!(popup&&popup.classList.contains('open')));
}
function syncWeekDayButtons(){
  document.querySelectorAll('.week-day-btn').forEach(b=>{
    const active=parseInt(b.dataset.weekday,10)===state.weekStart;
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',String(active));
  });
}
function setWeekStart(day){
  state.weekStart=day;
  saveWeekStart(day);
  syncWeekDayButtons();
  setControlPopupOpen('week-popup','week-icon-btn',false);
  renderHero();
  if(state.gradeTrendCourseId) renderGrades();
}
// ─── SAVED CUSTOM COLORS ───
// chrome.storage.local only — never localStorage. The iframe's localStorage is
// partitioned per embedding context and doesn't survive new Chrome windows
// (same reason setAccent persists cc2_accent this way). customColors starts
// empty and is populated by the async restore in DOMContentLoaded below.
function saveCustomColors(arr){
  try{chrome.storage.local.set({cc2_custom_colors:arr});}catch(e){}
}
// Read the saved swatches back from the durable store. This is the ONLY
// place customColors is populated at startup (called from DOMContentLoaded),
// so a Chrome restart — which wipes the iframe's partitioned localStorage but
// keeps chrome.storage.local — still restores the user's colors.
function restoreCustomColors(cb){
  try{
    chrome.storage.local.get(['cc2_custom_colors'],function(v){
      if(v&&Array.isArray(v.cc2_custom_colors)){
        customColors=v.cc2_custom_colors;
        buildSavedSwatches();
      }
      if(cb) cb();
    });
  }catch(e){ if(cb) cb(); }
}
function getCustomColors(){return customColors;}
let customColors=[];

function buildThemeSwatches(){
  const wrap=document.getElementById('theme-swatches');
  wrap.innerHTML='';
  COLORS.forEach(col=>{
    const d=document.createElement('button');
    d.type='button';
    d.className='th-swatch'+(col===state.accentColor?' active':'');
    d.style.background=col;d.dataset.color=col;
    d.setAttribute('aria-label','Use '+col+' accent color');
    d.setAttribute('aria-pressed',String(col===state.accentColor));
    d.onclick=e=>{e.stopPropagation();setAccent(col,true);renderAll();};
    wrap.appendChild(d);
  });
  // + button to open custom picker
  const addBtn=document.createElement('button');
  addBtn.type='button';
  addBtn.id='th-add-btn';addBtn.title='Custom color';addBtn.textContent='+';
  addBtn.setAttribute('aria-label','Choose custom accent color');
  addBtn.setAttribute('aria-expanded',String(document.getElementById('th-custom-panel')?.classList.contains('open')||false));
  addBtn.onclick=e=>{e.stopPropagation();toggleCustomPanel();};
  wrap.appendChild(addBtn);
  const ib=document.getElementById('theme-icon-btn');
  if(ib) ib.style.setProperty('--accent-swatch',state.accentColor);
  buildSavedSwatches();
}

let ctxTargetColor = null;

function showColorCtxMenu(e, col){
  e.preventDefault();e.stopPropagation();
  ctxTargetColor = col;
  const menu = document.getElementById('th-ctx-menu');
  if(!menu) return;
  menu.style.display = 'block';
  menu.style.left = e.clientX + 'px';
  menu.style.top  = e.clientY + 'px';
  // Bind delete action
  document.getElementById('th-ctx-delete').onclick = ()=>{
    customColors = customColors.filter(c=>c!==ctxTargetColor);
    saveCustomColors(customColors);
    buildSavedSwatches();
    menu.style.display='none';
  };
}

function buildSavedSwatches(){
  const wrap=document.getElementById('th-saved-swatches');
  const label=document.getElementById('th-saved-label');
  if(!wrap) return;
  wrap.innerHTML='';
  if(customColors.length>0&&label) label.style.display='block';
  else if(label) label.style.display='none';
  customColors.forEach(col=>{
    const d=document.createElement('button');
    d.type='button';
    d.className='th-swatch'+(col===state.accentColor?' active':'');
    d.style.background=col;d.dataset.color=col;
    d.setAttribute('aria-label','Use saved '+col+' accent color');
    d.setAttribute('aria-pressed',String(col===state.accentColor));
    d.title='Click to apply · Right-click to delete';
    d.onclick=e=>{e.stopPropagation();setAccent(col,true);renderAll();};
    d.oncontextmenu=e=>showColorCtxMenu(e, col);
    wrap.appendChild(d);
  });
}

function toggleCustomPanel(){
  const panel=document.getElementById('th-custom-panel');
  if(panel){
    panel.classList.toggle('open');
    document.getElementById('th-add-btn')?.setAttribute('aria-expanded',String(panel.classList.contains('open')));
    if(panel.classList.contains('open')) drawColorWheel();
  }
}

// ─── COLOR PICKER STATE ───
let cpHue=0, cpSat=0.9, cpBri=0.9;

function hsvToHex(h,s,v){
  let r,g,b;
  const i=Math.floor(h/60)%6, f=h/60-Math.floor(h/60);
  const p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
  if(i===0){r=v;g=t;b=p;}else if(i===1){r=q;g=v;b=p;}
  else if(i===2){r=p;g=v;b=t;}else if(i===3){r=p;g=q;b=v;}
  else if(i===4){r=t;g=p;b=v;}else{r=v;g=p;b=q;}
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}

function hexToHsv(hex){
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if(d!==0){
    if(max===r) h=((g-b)/d+6)%6;
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;
  }
  return{h, s:max===0?0:d/max, v:max};
}

function drawSBCanvas(){
  const c=document.getElementById('th-sb-canvas');
  if(!c)return;
  const ctx=c.getContext('2d');
  const w=c.width,h=c.height;
  // Fill with hue color
  ctx.fillStyle=`hsl(${cpHue},100%,50%)`;
  ctx.fillRect(0,0,w,h);
  // White gradient left→right
  const wg=ctx.createLinearGradient(0,0,w,0);
  wg.addColorStop(0,'rgba(255,255,255,1)');
  wg.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=wg;ctx.fillRect(0,0,w,h);
  // Black gradient top→bottom
  const bg=ctx.createLinearGradient(0,0,0,h);
  bg.addColorStop(0,'rgba(0,0,0,0)');
  bg.addColorStop(1,'rgba(0,0,0,1)');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  // Update handle position
  const handle=document.getElementById('th-sb-handle');
  if(handle){
    handle.style.left=(cpSat*100)+'%';
    handle.style.top=((1-cpBri)*100)+'%';
    handle.style.borderColor=cpBri>0.5?'#fff':'#ccc';
  }
}

function drawHueCanvas(){
  const c=document.getElementById('th-hue-canvas');
  if(!c)return;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,c.width,0);
  for(let i=0;i<=360;i+=30) g.addColorStop(i/360,`hsl(${i},100%,50%)`);
  ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
  const handle=document.getElementById('th-hue-handle');
  if(handle) handle.style.left=(cpHue/360*100)+'%';
}

function updatePickerFromHSV(){
  const hex=hsvToHex(cpHue,cpSat,cpBri);
  const dot=document.getElementById('th-preview-dot');
  if(dot) dot.style.background=hex;
  drawSBCanvas();
  drawHueCanvas();
}

function onHexInput(){
  const val=document.getElementById('th-hex-inp').value.trim();
  if(/^[0-9A-Fa-f]{6}$/.test(val)){
    const hsv=hexToHsv('#'+val);
    cpHue=hsv.h;cpSat=hsv.s;cpBri=hsv.v;
    updatePickerFromHSV();
  }
}

function setupSBPicker(){
  const c=document.getElementById('th-sb-canvas');
  if(!c||c._bound)return;
  c._bound=true;
  function pickSB(e){
    const rect=c.getBoundingClientRect();
    const x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    const y=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    cpSat=x;cpBri=1-y;
    updatePickerFromHSV();
  }
  let dragging=false;
  c.addEventListener('mousedown',e=>{dragging=true;pickSB(e);});
  document.addEventListener('mousemove',e=>{if(dragging)pickSB(e);});
  document.addEventListener('mouseup',()=>dragging=false);
  c.addEventListener('mousemove',e=>{if(!dragging){
    // hover preview
    const rect=c.getBoundingClientRect();
    const x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    const y=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    const hex=hsvToHex(cpHue,x,1-y);
    const dot=document.getElementById('th-preview-dot');
    if(dot) dot.style.background=hex;
  }});
  c.addEventListener('mouseleave',()=>updatePickerFromHSV());
}

function setupHuePicker(){
  const c=document.getElementById('th-hue-canvas');
  if(!c||c._bound)return;
  c._bound=true;
  function pickHue(e){
    const rect=c.getBoundingClientRect();
    cpHue=Math.max(0,Math.min(360,(e.clientX-rect.left)/rect.width*360));
    updatePickerFromHSV();
  }
  let dragging=false;
  c.addEventListener('mousedown',e=>{dragging=true;pickHue(e);});
  document.addEventListener('mousemove',e=>{if(dragging)pickHue(e);});
  document.addEventListener('mouseup',()=>dragging=false);
}

function drawColorWheel(){
  drawSBCanvas();
  drawHueCanvas();
  setupSBPicker();
  setupHuePicker();
  updatePickerFromHSV();
}

function pickWheelColor(e){}  // no-op, handled by mousedown on canvases
function previewWheelColor(e){}

function applyCustomColor(){
  const val=hsvToHex(cpHue,cpSat,cpBri);
  if(!COLORS.includes(val)&&!customColors.includes(val)){
    customColors.push(val);
    if(customColors.length>12) customColors.shift();
    saveCustomColors(customColors);
  }
  setAccent(val,true);
  buildSavedSwatches();
  renderAll();
  const dot=document.getElementById('th-preview-dot');
  if(dot) dot.style.background=val;
}

// ─── RINGS ───
// Dispatches to the current visual theme's ring-chart renderer. Every variant
// reads the same weekly completion data. Nature uses a larger botanical
// stage; the other themes share a compact instrument-sized stage.
function drawRings(){
  if(state.theme==='orbit') return drawSolarRings();
  if(state.theme==='racing') return drawRacingRings();
  if(state.theme==='tech') return drawHexRings();
  if(state.theme==='nature') return drawVineRings();
  return drawSleekRings();
}
// All graphic variants use the same weekly data. SVG segments keep Tech's
// completed arc segmented too; a zero score paints no progress cap.
function drawSleekRings(){ drawGraphicRings('sleek'); }
function drawGeometricRings(){ drawGraphicRings('geometric'); }
function drawHexRings(){ drawGraphicRings('tech'); }
function drawBars(){
  if(state.theme==='orbit') return drawGraphicBars('orbit');
  if(state.theme==='nature') return drawTreeBars();
  if(state.theme==='racing') return drawRacingBars();
  if(state.theme==='tech') return drawPixelBars();
  return drawSleekBars();
}
function drawSleekBars(){ drawGraphicBars('sleek'); }
// Continuous poster silhouettes: the highest point is the exact data endpoint.
function geometricBarSilhouette(index,pct){
  const height=Math.max(0,Math.min(1,pct))*148,top=170-height;
  const shoulder=Math.min(13,height),peak=Math.min(21,height),bevel=Math.min(7,height);
  const crowns=[
    `M7 ${top+shoulder}Q7 ${top} 20 ${top}Q33 ${top} 33 ${top+shoulder}`,
    `M7 ${top}H33`,
    `M7 ${top+peak}L20 ${top}L33 ${top+peak}`,
    `M7 ${top+bevel}L14 ${top}H26L33 ${top+bevel}`,
    `M7 ${top+shoulder}L33 ${top}`,
    `M7 ${top+shoulder}L13.5 ${top}H26.5L33 ${top+shoulder}`,
  ];
  return crowns[index%6]+'V170H7Z';
}
function drawPixelBars(){ drawGraphicBars('tech'); }

// Courses run outermost to innermost, matching the class list. Spacing is illustrative so every
// planet and the weekly completion strokes remain readable in the sidebar.
const ORBIT_PLANETS = [
  {name:'Mercury',color:'#A9A39B',size:3.5},
  {name:'Venus',color:'#E6BD7E',size:5},
  {name:'Earth',color:'#438DD5',size:5.3},
  {name:'Mars',color:'#D67A52',size:4.1},
  {name:'Jupiter',color:'#D5AC87',size:7},
  {name:'Saturn',color:'#D7C28E',size:6},
  {name:'Uranus',color:'#8ED6DB',size:5.2},
  {name:'Neptune',color:'#486BD2',size:5.2},
];
function orbitPlanetArt(index){
  const p=ORBIT_PLANETS[index];
  if(!p) return '';
  const r=p.size,shadeId='orbit-sphere-'+index;
  let details='';
  if(index===0) details='<circle cx="-1" cy="-1" r="1" fill="#736E68"/><circle cx="1.5" cy="1" r=".65" fill="#D4CDC2"/>';
  if(index===1) details='<path d="M-4 -1Q0 -3 4 -1M-3 2Q0 0 3 2" fill="none" stroke="#F7DCAD" stroke-width="1"/>';
  if(index===2) details='<path class="orbit-land" d="M-3 -4 0-4 1-2-1 0-3-1ZM1 0 4 1 3 4 1 3Z" fill="#76B777"/><path d="M-4 1Q0 -1 4 0" stroke="#FFF" stroke-width=".7" fill="none" opacity=".65"/>';
  if(index===3) details='<path d="M-3 0 0-1 2 1 0 2Z" fill="#A24B35"/><ellipse cy="-3.3" rx="1.4" ry=".5" fill="#F7DBBC"/>';
  if(index===4) details='<path d="M-6 -3Q0 -1 6 -3M-7 1Q0 3 7 1M-5 4H5" stroke="#9C6E55" stroke-width="1.3" fill="none"/><ellipse cx="2.5" cy="2" rx="2" ry="1" fill="#B65F46"/>';
  if(index===5) details='<path d="M-5 -1Q0 1 5 -1M-4 3H4" stroke="#B69861" stroke-width="1" fill="none"/><ellipse class="saturn-rings" rx="10" ry="3" transform="rotate(-25)" stroke="#BDA77B" stroke-width="1.6" fill="none"/>';
  if(index===6) details='<path d="M-4 -2 4 2M-3 -4 5 0" stroke="#C2ECEA" stroke-width="1" fill="none" opacity=".65"/>';
  if(index===7) details='<path d="M-4 0Q0 -2 4 0M-2 3H2" stroke="#81A5E5" stroke-width="1" fill="none"/><ellipse cx="2" cy="-1" rx="1.3" ry=".7" fill="#304E99"/>';
  return `<g class="orbit-planet" data-planet="${p.name}"><defs><radialGradient id="${shadeId}" cx="30%" cy="24%" r="80%"><stop stop-color="#FFFFFF" stop-opacity=".23"/><stop offset=".45" stop-color="#FFFFFF" stop-opacity="0"/><stop offset=".78" stop-color="#08101B" stop-opacity=".18"/><stop offset="1" stop-color="#02060E" stop-opacity=".6"/></radialGradient></defs><circle r="${r}" fill="${p.color}" stroke="var(--text)" stroke-width=".45"/>${details}<circle r="${r}" fill="url(#${shadeId})"/><path d="M${-r*.55} ${-r*.65}Q${-r*.9} 0 ${-r*.45} ${r*.6}" stroke="#FFF" stroke-width=".7" opacity=".35" fill="none"/></g>`;
}
function drawSolarRings(){
  const svg=document.getElementById('ring-svg');
  if(!svg) return;
  svg.setAttribute('width','264');svg.setAttribute('height','264');
  svg.setAttribute('viewBox','0 0 264 264');svg.setAttribute('role','img');
  const count=Math.min(state.courses.length,ORBIT_PLANETS.length);
  svg.setAttribute('aria-label','Weekly course progress: '+ORBIT_PLANETS.slice(0,count).map(p=>p.name).reverse().join(', ')+'. One orbit per assigned course, in class-list order from outermost to innermost. Sizes and distances are illustrative.');
  const week=getWeekRange(state.weekStart),cx=132,cy=132;
  // NASA/GSFC/SDO PIA26681, bundled locally. The SVG clip crops inside
  // the solar limb, removing the photograph's black background in both modes.
  let art=`<defs><clipPath id="orbit-sun-disc"><circle cx="${cx}" cy="${cy}" r="10.5"/></clipPath><radialGradient id="orbit-sun-halo"><stop stop-color="#F7F7F4" stop-opacity=".58"/><stop offset=".6" stop-color="#ECEEF2" stop-opacity=".18"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient><filter id="orbit-flare-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur in="SourceGraphic" stdDeviation=".65"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g class="orbit-sun"><title>Sun — NASA/GSFC/Solar Dynamics Observatory</title><circle cx="${cx}" cy="${cy}" r="21" fill="url(#orbit-sun-halo)"/><circle cx="${cx}" cy="${cy}" r="10.5" fill="#BD891D"/><image href="assets/orbit-sun-nasa.jpg" x="${cx-14}" y="${cy-14}" width="28" height="28" clip-path="url(#orbit-sun-disc)"/><circle cx="${cx}" cy="${cy}" r="10.4" fill="none" stroke="#F5F5F1" stroke-width=".65"/><g class="orbit-solar-flares" filter="url(#orbit-flare-glow)">${Array.from({length:64},(_,i)=>{
    const length=1.2+3.4*(.5+.5*Math.sin(i*2.17))**2;
    const lean=Math.sin(i*1.73)*1.2,width=.45+.35*(.5+.5*Math.cos(i*2.31));
    return `<path transform="translate(${cx} ${cy}) rotate(${i*360/64}) translate(0 -10)" d="M${-width} .8 C${-width*1.5} ${-length*.4} ${lean-1} ${-length*.8} ${lean} ${-length} C${lean-.15} ${-length*.35} ${width*1.4} ${-length*.25} ${width} .8Z" fill="${i%3===0?'#FFFFFF':i%3===1?'#F1F2F4':'#DDE1E8'}" opacity="${.55+(i%4)*.1}"/>`;
  }).join('')}</g></g>`;
  art+= [[20,80],[238,63],[39,221],[218,223],[90,18],[244,169],[72,77],[178,187]].map(([x,y],i)=>`<path class="orbit-sky-star" d="M${x-2} ${y}h4M${x} ${y-2}v4"/>`).join('');
  const planetParts=[],descriptions=[];let tracks='';
  Array.from({length:count},(_,index)=>index).forEach(index=>{
    // Planets keep their true order from the Sun: Mercury sits innermost, and the first course (outermost orbit) takes the farthest planet shown.
    const planetIndex=count-1-index,planet=ORBIT_PLANETS[planetIndex];
    const r=count===1?88:113-index*77/Math.max(count-1,1),len=2*Math.PI*r,course=state.courses[index];
    const ink=course.color||'var(--accent)',fieldId='orbit-starfield-'+index;
    tracks+=`<defs><pattern id="${fieldId}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" class="orbit-space-base" style="--orbit-color:${ink};--orbit-space:color-mix(in srgb,${ink} 44%,#02040B);"/><g fill="#F5F3FF"><circle cx="3" cy="4" r=".7"/><circle cx="16" cy="9" r=".55"/><circle cx="8" cy="19" r=".65"/><circle cx="22" cy="21" r=".45"/></g><path d="M18 17h3M19.5 15.5v3" stroke="#D6E6FF" stroke-width=".55"/></pattern></defs>`;
    const weekly=state.assignments.filter(a=>a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
    const done=weekly.filter(a=>a.done).length,pct=weekly.length?done/weekly.length:0;
    descriptions.push(`${planet.name}: ${course.name}, ${done} of ${weekly.length} assignments complete`);
    tracks+=`<g class="solar-orbit" data-course-id="${esc(course.id)}" style="--orbit-color:${ink}" data-radius="${r}" data-planet="${planet.name}"><title>${planet.name}: ${esc(course.name)} — ${done}/${weekly.length} complete</title><circle cx="${cx}" cy="${cy}" r="${r}" class="solar-ring-track"/>`;
    if(pct>0)tracks+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="solar-ring-progress" style="stroke:url(#${fieldId});" stroke-dasharray="${len*pct} ${len}" transform="rotate(-90 ${cx} ${cy})"/>`;
    // Movement is decorative; only arc length encodes course completion.
    // Independent periods keep the solar system moving gently, without
    // presenting these illustrative positions as live astronomical data.
    const duration=20+index*9,phase=index*47+24;
    planetParts.push(`<g class="orbit-motion" data-orbit-index="${index}" data-orbit-radius="${r}" style="--orbit-period:${duration}s;--orbit-phase:${phase}deg;"><g transform="translate(${cx+r} ${cy})"><g transform="scale(1.35)">${orbitPlanetArt(planetIndex)}</g></g></g>`);
    tracks+='</g>';
  });
  svg.setAttribute('aria-label','Weekly course progress. '+descriptions.join('. ')+(state.courses.length>count?`. First ${count} courses shown; bar chart shows every course.`:'.')+' Planet sizes and movement are illustrative.');
  const trackLayer=svg.querySelector('.solar-track-layer');
  if(trackLayer && svg.querySelector('.orbit-motion-layer')){
    trackLayer.innerHTML=tracks;
    const layer=svg.querySelector('.orbit-motion-layer');
    // The planet each orbit carries depends on how many orbits there are, so start over when that count changes.
    if(layer.dataset.planetCount!==String(count)){layer.textContent='';layer.dataset.planetCount=String(count);}
    // Reconcile actual courses without replacing existing animated nodes.
    Array.from(layer.children).forEach(node=>{
      const index=Number(node.dataset.orbitIndex);
      if(!node.hasAttribute('data-orbit-index')||index>=count) node.remove();
      else{
        const r=count===1?88:113-index*77/Math.max(count-1,1);
        node.dataset.orbitRadius=String(r);
        node.firstElementChild.setAttribute('transform',`translate(${cx+r} ${cy})`);
      }
    });
    planetParts.forEach((markup,index)=>{
      if(!layer.querySelector(`[data-orbit-index="${index}"]`))layer.insertAdjacentHTML('beforeend',markup);
    });
  }else{
    svg.innerHTML=art+`<g class="solar-track-layer">${tracks}</g><g class="orbit-motion-layer">${planetParts.join('')}</g>`;
    svg.querySelector('.orbit-motion-layer').dataset.planetCount=String(count);
  }
}

// A course keeps the same geometric stamp and texture in both chart styles.
function geometricShape(index){
  return [
    '<circle r="8"/>',
    '<rect x="-7" y="-7" width="14" height="14"/>',
    '<path d="M0-9 9 7H-9Z"/>',
    '<path d="M-3.3-8H3.3L8-3.3V3.3L3.3 8H-3.3L-8 3.3V-3.3Z"/>',
    '<path d="M0-10 9 0 0 10-9 0Z"/>',
    '<path d="m-8-5 8-5 8 5v10l-8 5-8-5Z"/>',
  ][index%6];
}
function geometricTile(index){
  return [
    '<circle cx="4" cy="4" r="1.4"/>',
    '<path d="M0 0h4v4H0ZM4 4h4v4H4Z"/>',
    '<path d="M4 1 7 7H1Z"/>',
    '<path d="M2.6.6H5.4L7.4 2.6V5.4L5.4 7.4H2.6L.6 5.4V2.6Z"/>',
    '<path d="m4 0 3 4-3 4-3-4Z"/>',
    '<path d="M4 .5 7 2.25v3.5L4 7.5 1 5.75v-3.5Z"/>',
  ][index%6];
}
function geometricPattern(id,index){
  return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><g fill="white" opacity=".36">${geometricTile(index)}</g></pattern>`;
}
function geometricTexture(index){
  const tile=`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><g fill="white" opacity=".36">${geometricTile(index)}</g></svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(tile).replace(/'/g,'%27')}')`;
}
function drawGeometricBars(){
  const wrap=document.getElementById('bar-chart-wrap');
  if(!wrap)return;
  const week=getWeekRange(state.weekStart);
  wrap.classList.toggle('many-courses',state.courses.length>6);
  wrap.innerHTML=state.courses.map((course,index)=>{
    const weekly=state.assignments.filter(a=>a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
    const done=weekly.filter(a=>a.done).length,pct=weekly.length?done/weekly.length:0;
    const id=`geometric-bar-${index}`,silhouette=geometricBarSilhouette(index,pct);
    return `<div class="graphic-bar-column geometric-column" title="${esc(course.name)}: ${done}/${weekly.length} complete">
      <span class="graphic-bar-value">${done}/${weekly.length}</span>
      <svg class="geometric-bar-art" viewBox="0 0 40 184" role="img" aria-label="${esc(course.name)}: ${done}/${weekly.length} assignments complete">
        <defs>${geometricPattern(id,index)}</defs>
        <rect class="geometric-empty-track" x="7" y="22" width="26" height="148" fill="var(--ring-track)"/>
        <path class="geometric-track-ticks" d="M7 59h26M7 96h26M7 133h26"/>
        ${pct>0?`<g class="geometric-print" data-geometry="${index%6}"><path class="geometric-print-color" d="${silhouette}" fill="${course.color}"/><path d="${silhouette}" fill="url(#${id})"/><path class="geometric-print-edge" d="${silhouette}"/></g>`:''}
        <path class="geometric-bar-baseline" d="M4 172h32"/>
      </svg><span class="graphic-bar-code">${esc(course.code||course.name)}</span>
    </div>`;
  }).join('');
}

// Poster geometry and instrument markings share the exact weekly data model.
function drawDesignedRings(theme){
  const svg=document.getElementById('ring-svg');
  if(!svg)return;
  const tech=theme==='tech',cx=132,cy=132,week=getWeekRange(state.weekStart);
  const courses=state.courses.slice(0,6),pitch=76/Math.max(3,courses.length-1);
  const band=Math.min(tech?11:16,pitch-5);
  svg.setAttribute('width','264');svg.setAttribute('height','264');
  svg.setAttribute('viewBox','0 0 264 264');svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Weekly assignment completion by course');
  let art='',defs='',total=0,complete=0;
  if(tech){
    art=Array.from({length:80},(_,i)=>`<path d="M132 8v${i%5?2:5}" transform="rotate(${i*4.5} 132 132)" class="instrument-tick"/>`).join('');
    art+='<g class="instrument-frame"><path d="M6 32V8h24M234 8h24v24M258 234v24h-24M30 258H6v-24"/><path d="M132 1v4M263 132h-4M132 263v-4M1 132h4"/></g>';
    art+='<g class="instrument-scale" aria-hidden="true"><text x="132" y="23">0</text><text x="247" y="135">25</text><text x="132" y="249">50</text><text x="17" y="135">75</text></g>';
  }else{
    art='<g class="poster-confetti" aria-hidden="true"><path d="m12 27 8-12 8 12Z"/><path d="m242 222 8-12 8 12Z"/><path d="m18 230 4-5 4 5 4-5 4 5M231 31l4-5 4 5 4-5 4 5"/><circle cx="38" cy="14" r="3"/><circle cx="228" cy="250" r="3"/></g>';
  }
  courses.forEach((course,index)=>{
    const weekly=state.assignments.filter(a=>a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
    const done=weekly.filter(a=>a.done).length,pct=weekly.length?done/weekly.length:0;
    total+=weekly.length;complete+=done;
    const r=102-index*pitch,len=2*Math.PI*r,id=`${theme}-course-${index}`;
    art+=`<g class="course-ring" data-course-id="${esc(course.id)}"><title>${esc(course.name)}: ${done}/${weekly.length} assignments complete</title>`;
    if(tech){
      const unit=len/60;
      // A single repeated track replaces sixty identical track circles. Lit
      // segments retain partial fills, so the displayed completion stays exact.
      art+=`<circle cx="132" cy="132" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${band}" stroke-dasharray="${unit*.78} ${unit*.22}" transform="rotate(-90 132 132)"/>`;
      for(let k=0;k<60;k++){
        const filled=Math.max(0,Math.min(1,pct*60-k)),angle=-90+k*6;
        if(filled)art+=`<circle cx="132" cy="132" r="${r}" fill="none" stroke="${course.color}" stroke-width="${band}" stroke-dasharray="${unit*.78*filled} ${len-unit*.78*filled}" transform="rotate(${angle} 132 132)"/>`;
      }
    }else{
      defs+=geometricPattern(`${id}-texture`,index)+`<mask id="${id}-arc"><circle cx="132" cy="132" r="${r}" fill="none" stroke="#fff" stroke-width="${band}" stroke-dasharray="${len*pct} ${len}" transform="rotate(-90 132 132)"/></mask>`;
      art+=`<circle cx="132" cy="132" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${band}"/>`;
      if(pct>0)art+=`<circle cx="132" cy="132" r="${r}" fill="none" stroke="${course.color}" stroke-width="${band}" stroke-dasharray="${len*pct} ${len}" transform="rotate(-90 132 132)"/><circle cx="132" cy="132" r="${r}" fill="none" stroke="url(#${id}-texture)" stroke-width="${band}" mask="url(#${id}-arc)"/>`;
    }
    if(pct>0&&!tech){
      const a=pct*2*Math.PI,x=cx+r*Math.sin(a),y=cy-r*Math.cos(a);
      art+=`<g class="geometric-marker" data-geometry="${index%6}" transform="translate(${x} ${y}) rotate(${pct*360})" fill="${course.color}">${geometricShape(index)}</g>`;
    }
    art+='</g>';
  });
  const percent=total?Math.round(complete/total*100):0;
  const subset=courses.length<state.courses.length;
  svg.setAttribute('aria-label',`Weekly assignment completion by course. ${complete} of ${total} assignments complete, ${percent}%. ${subset?'First '+courses.length+' courses shown; bar chart shows every course.':'All '+courses.length+' courses shown.'}`);
  svg.innerHTML=`<defs>${defs}</defs>${art}`;
}

function drawGraphicRings(theme){
  if(theme==='geometric'||theme==='tech')return drawDesignedRings(theme);
  const svg=document.getElementById('ring-svg');
  if(!svg)return;
  svg.setAttribute('width','264');svg.setAttribute('height','264');
  svg.setAttribute('viewBox','0 0 264 264');svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Weekly assignment completion by course');
  const week=getWeekRange(state.weekStart),courses=state.courses.slice(0,6);
  const pitch=76/Math.max(courses.length-1,3),width=Math.min(pitch-5,10);
  let complete=0,total=0;
  const rings=courses.map((course,index)=>{
    const weekly=state.assignments.filter(a=>a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
    const done=weekly.filter(a=>a.done).length,pct=weekly.length?done/weekly.length:0;
    complete+=done;total+=weekly.length;
    const r=102-index*pitch,len=2*Math.PI*r;
    return `<g class="course-ring" data-course-id="${esc(course.id)}"><title>${esc(course.name)}: ${done}/${weekly.length} assignments complete</title><circle cx="132" cy="132" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${width}"/>${pct>0?`<circle cx="132" cy="132" r="${r}" fill="none" stroke="${course.color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${len*pct} ${len}" transform="rotate(-90 132 132)"/>`:''}</g>`;
  }).join('');
  const percent=total?Math.round(complete/total*100):0;
  const subset=courses.length<state.courses.length;
  svg.setAttribute('aria-label',`Weekly assignment completion by course. ${complete} of ${total} assignments complete, ${percent}%. ${subset?'First '+courses.length+' courses shown; bar chart shows every course.':'All '+courses.length+' courses shown.'}`);
  svg.innerHTML=rings;
}

// Compact mission-craft artwork; each chart column owns its gradient IDs.
function orbitRocketArt(index){
  const id='orbit-craft-'+index;
  return `<svg class="orbit-ship" viewBox="0 0 36 64" aria-hidden="true"><defs>
    <linearGradient id="${id}-hull" x1="0" x2="1"><stop stop-color="#8398AD"/><stop offset=".35" stop-color="#F6F8FA"/><stop offset=".65" stop-color="#D6E0E9"/><stop offset="1" stop-color="#8FA4B9"/></linearGradient>
    <linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#A1E3F3"/><stop offset=".5" stop-color="#438EB5"/><stop offset="1" stop-color="#244D79"/></linearGradient>
    <linearGradient id="${id}-flame" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFF4CB"/><stop offset=".4" stop-color="#F9C76B"/><stop offset="1" stop-color="#E7984B" stop-opacity="0"/></linearGradient>
  </defs><path d="M13 47Q11 53 18 63Q25 53 23 47Z" fill="url(#${id}-flame)"/><path d="M16 48Q15 53 18 58Q21 53 20 48Z" fill="#FFF2C8" opacity=".85"/>
  <path d="M11 29 4 39 3 49 13 44M25 29l7 10 1 10-10-5" fill="var(--orbit-color,#7E9AD7)"/><path d="m5 41-1 6 6-4m21-2 1 6-6-4" fill="#334C6B" opacity=".5"/>
  <path d="M11 45V23Q11 12 18 3Q25 12 25 23V45Z" fill="url(#${id}-hull)"/><path d="M12 20Q13 11 18 3Q23 11 24 20Z" fill="var(--orbit-color,#7E9AD7)"/><path d="M18 5Q14 15 14 23v16" fill="none" stroke="#FFF" stroke-width=".8" opacity=".55"/>
  <circle cx="18" cy="28" r="5.4" fill="#657E97"/><circle cx="18" cy="28" r="4.1" fill="url(#${id}-glass)"/><path d="M15.8 27.5q.3-2 2.6-2" fill="none" stroke="#DEF5FA" stroke-width=".9" stroke-linecap="round"/>
  <path d="M12 40h12M12 43h12" stroke="#7E91A4" stroke-width=".6"/><path d="M13 45h10l-1 4h-8Z" fill="#4F657C"/><path d="M16 38h4v9h-4Z" fill="#A5B6C7"/>
  </svg>`;
}

function drawGraphicBars(theme){
  if(theme==='geometric')return drawGeometricBars();
  const wrap=document.getElementById('bar-chart-wrap');
  if(!wrap) return;
  const week=getWeekRange(state.weekStart);
  wrap.classList.toggle('many-courses',state.courses.length>6);
  wrap.innerHTML=state.courses.map((course,index)=>{
    const weekly=state.assignments.filter(a=>a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
    const done=weekly.filter(a=>a.done).length,pct=weekly.length?done/weekly.length:0;
    let art='';
    if(theme==='tech'){
      art=Array.from({length:16},(_,k)=>{
        const fill=Math.max(0,Math.min(1,pct*16-(15-k)))*100;
        return `<span class="pixel-cell">${fill>0?`<i style="height:${fill}%;background:${course.color}"></i>`:''}</span>`;
      }).join('');
    }else{
      art=`<span class="graphic-bar-fill" style="height:${pct*100}%;background:${course.color}">${theme==='orbit'&&pct>0?orbitRocketArt(index):''}</span>`;
    }
    if(theme!=='tech'&&pct===0) art='';
    return `<div class="graphic-bar-column" style="--orbit-color:${course.color};" title="${esc(course.name)}: ${done}/${weekly.length} complete">
      <span class="graphic-bar-value">${done}/${weekly.length}</span>
      <div class="graphic-bar-track ${theme}" role="img" aria-label="${esc(course.name)}: ${done}/${weekly.length} assignments complete">${art}</div>
      <span class="graphic-bar-code">${esc(course.code||course.name)}</span>
    </div>`;
  }).join('');
}

// ─── NATURE THEME CHART ART ───
// Material choices become botanical wreaths; bar mode is a growing woodland.
function natureRgb(hex){
  let h=String(hex||'').replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  if(!/^[0-9a-f]{6}$/i.test(h)) h='8A6642';
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
function natureHex(rgb){
  return '#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function natureMix(a,b,t){
  const x=natureRgb(a),y=natureRgb(b);
  return natureHex([0,1,2].map(i=>x[i]+(y[i]-x[i])*t));
}
function natureShade(color,amount){
  return natureMix(color,amount>0?'#FFFFFF':'#000000',Math.abs(amount));
}
function natureCourses(){
  const week=getWeekRange(state.weekStart);
  return state.courses.map((course,index)=>{
    const weekly=state.assignments.filter(a=>
      a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
    const done=weekly.filter(a=>a.done).length;
    return {
      id:course.id,
      code:course.code||course.name||'Course',
      name:course.name||course.code||'Course',
      color:['#456B42','#7D9852','#3F8070','#A0AC69','#607F48','#8AA879'][index%6],
      done,total:weekly.length,
      pct:weekly.length?done/weekly.length:0,
      material:normalizeNatureMaterial(course.natureMaterial,index),
    };
  });
}
function natureSpecies(key){
  const species={
    oak:{leaf:['#304D3D','#456950','#638268','#91A781'],trunk:['#8A5E38','#A0703F','#6E4A28']},
    birch:{leaf:['#536A44','#7A905B','#9AAF78','#C0CC9D'],trunk:['#D9D2C2','#F2EEE4','#C2BAA6']},
    cherry:{leaf:['#AE687E','#CE8E9B','#E6B5BB','#F1D6D2'],trunk:['#7A5A44','#8E6B50','#5E4230']},
  };
  return species[key]||species.oak;
}
function natureRingPitch(courseCount){
  const slots=Math.max(4,Math.max(1,Number(courseCount)||0));
  return (80-24)/slots;
}
function natureRingMaterial(index){
  return NATURE_MATERIALS[Math.abs(Number(index)||0)%NATURE_MATERIALS.length];
}

const nf=n=>(+n).toFixed(1);

function natureLeafArt(s,fill='#69845A'){
  const d=`M0 0 C ${nf(s*.5)} ${nf(-s*.16)}, ${nf(s*.58)} ${nf(-s*.72)}, 0 ${nf(-s)} C ${nf(-s*.58)} ${nf(-s*.72)}, ${nf(-s*.5)} ${nf(-s*.16)}, 0 0 Z`;
  const veins=[.24,.42,.6].map(t=>`<path d="M0 ${nf(-s*t)} L ${nf(s*.4*(1-t))} ${nf(-s*(t+.22))}"/><path d="M0 ${nf(-s*t)} L ${nf(-s*.4*(1-t))} ${nf(-s*(t+.22))}"/>`).join('');
  return `<g><path d="${d}" fill="${fill}"/><path d="${d}" fill="none" stroke="#2E4A12" stroke-width="${nf(s*.05)}" opacity=".5"/><g stroke="#2E4A12" stroke-width="${nf(s*.042)}" opacity=".5" fill="none">${veins}</g><path d="M0 ${nf(-s*.06)} L 0 ${nf(-s*.9)}" stroke="#2E4A12" stroke-width="${nf(s*.07)}" opacity=".6"/><path d="M ${nf(-s*.3)} ${nf(-s*.62)} C ${nf(-s*.44)} ${nf(-s*.4)}, ${nf(-s*.36)} ${nf(-s*.18)}, ${nf(-s*.12)} ${nf(-s*.08)}" fill="none" stroke="#fff" stroke-width="${nf(s*.06)}" opacity=".18"/></g>`;
}
// Each habitat has five distinct silhouettes, with layered color, botanical
// detail and asymmetric growth. Shared by the chart and material selectors.
let natureArtSerial=0;
function natureSpecimenArt(material,size,variant=0){
  const v=((variant%5)+5)%5,id='botanical-'+natureArtSerial++;
  const types={rose:['rose','daisy','rosebud','fern','berries'],log:['fly-agaric','chanterelle','woodland-fern','shelf-fungus','moss'],cactus:['saguaro','prickly-pear','agave','barrel-cactus','desert-bloom'],coral:['sea-fan','staghorn','tube-coral','anemone','seaweed'],pond:['water-lily','cattail','lotus','lily-pads','water-iris'],tulip:['coral-tulip','golden-tulips','bluebells','daisy','fern']};
  const gradients=[['leaf','#AFCD93','#477D62'],['petal','#F9C7B9','#BD5275'],['gold','#FFE5A1','#CE8C3C'],['wood','#F5D9B3','#AD6B42'],['water','#A6D8CC','#438F91']].map(([name,a,b])=>`<linearGradient id="${id}-${name}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('');
  const paint=name=>`url(#${id}-${name})`;
  const line=(d,color='#537D60',w=.8)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const leaf=(x,y,angle,scale=1)=>`<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})"><path d="M0 0C-8-1-11-9-4-14C3-12 5-5 0 0Z" fill="${paint('leaf')}"/>${line('M0-1-4-12M-1-5-6-6M-2-8 0-10','#DFE8B5',.5)}</g>`;
  const stem=(d,w=1.2)=>line(d,'#638D68',w);
  const flower=(x,y,r,color='petal',petals=7)=>`<g transform="translate(${x} ${y})">${Array.from({length:petals},(_,j)=>`<g transform="rotate(${j*360/petals})"><path d="M0 0C${-r*.8} ${-r*.4} ${-r*.6} ${-r*1.5} 0 ${-r*1.3}C${r*.7} ${-r*1.4} ${r*.8} ${-r*.4} 0 0Z" fill="${paint(color)}"/>${line(`M0-1 0 ${-r}`,color==='gold'?'#FFF0C3':'#FCE1D5',.45)}</g>`).join('')}<circle r="${r*.32}" fill="#B78237"/>${Array.from({length:7},(_,j)=>`<circle cx="${Math.cos(j)*r*.2}" cy="${Math.sin(j)*r*.2}" r=".45" fill="#F8E0A1"/>`).join('')}</g>`;
  const fern=()=>stem('M0 17Q-5 0 2-17')+Array.from({length:8},(_,j)=>{const y=12-j*3.5,w=8-j*.7;return `<g>${line(`M-2 ${y}Q${-w} ${y-1} ${-w-2} ${y-6}M-2 ${y}Q${w} ${y-3} ${w} ${y-7}`,paint('leaf'),2.3)}${line(`M-2 ${y} ${-w} ${y-5}M-2 ${y} ${w-1} ${y-6}`,'#C0D4A1',.4)}</g>`;}).join('');
  const tulip=(x,y,color,angle=0)=>`<g transform="translate(${x} ${y}) rotate(${angle})">${stem('M0 14Q2 3 0-5')}${leaf(0,12,-50,.65)}<path d="M-8-15-3-11 0-17 3-11 8-15V-7Q7 2 0 2Q-7 1-8-7Z" fill="${paint(color)}"/><path d="M0-15Q-4-4 0 1Q6-2 6-10" fill="none" stroke="#FFE0BD" stroke-width=".75" opacity=".7"/></g>`;
  let art='';
  if(material==='rose'){
    if(v===0){
      art=stem('M0 16Q4 4-1-3')+leaf(1,13,65,.75)+leaf(1,9,-55,.8);
      art+='<g transform="translate(0 -6)">'+Array.from({length:4},(_,layer)=>Array.from({length:6-layer},(_,j)=>`<path transform="rotate(${j*360/(6-layer)+layer*31}) scale(${1-layer*.2})" d="M-2 3C-14 1-12-11-5-12C3-17 13-9 10-3Q5 4-2 3Z" fill="${['#A84768','#CC6581','#E895A0','#F4C1B7'][layer]}" stroke="#F9D4C3" stroke-opacity=".45" stroke-width=".45"/>`).join('')).join('')+line('M-3-2Q-4-7 1-6T1-1','#FCE1CA',.7)+'</g>';
    }
    if(v===1)art=stem('M-1 17Q4 0 0-9')+leaf(0,12,-65,.8)+flower(0,-6,10,'gold',11);
    if(v===2)art=stem('M0 17Q-4 1 2-9M-2 5Q-11 2-10-7')+leaf(-1,11,65,.7)+`<path d="M-5-9Q-7-19 1-19Q10-18 7-10L2-5Z" fill="${paint('petal')}"/>`+line('M1-17Q-2-11 2-6','#F9D8BC')+`<path d="M-13-7Q-16-15-10-16Q-4-15-7-7Z" fill="${paint('petal')}"/>`+leaf(1,-5,-10,.45);
    if(v===3)art=fern();
    if(v===4)art=stem('M0 17Q-4 1 2-14M-2 4-10-3M-2 0 8-7')+leaf(-1,12,-55,.65)+leaf(0,8,65,.8)+[[-10,-5],[-6,-8],[8,-9],[3,-13],[7,-15]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3" fill="${paint('petal')}"/><circle cx="${x-1}" cy="${y-1}" r=".75" fill="#FAD6C5"/>`).join('');
  }
  if(material==='log'){
    if(v===0||v===1){
      const gold=v===1;
      art=`<path d="M-2-3Q-1 6-5 16Q0 20 6 16Q2 8 3-3Z" fill="${paint('wood')}"/>`+line('M1 0 0 14','#FBE8CF',1.1)+`<path d="M-16-2Q-13-19 0-18Q13-17 16-2Q4 6-16-2Z" fill="${paint(gold?'gold':'petal')}"/>`+line('M-14-1Q0 5 14-1','#F4C8AA',1.2);
      art+=Array.from({length:gold?9:7},(_,j)=>gold?line(`M${-12+j*3} 0 0 5`,'#B8793C',.55):`<ellipse cx="${Math.sin(j*2.4)*11}" cy="${-5-Math.cos(j*1.9)**2*8}" rx="${1.1+j%3*.4}" ry="1" fill="#FFF0D9"/>`).join('');
      if(gold)art+=leaf(-7,17,-60,.6);
    }
    if(v===2)art=fern();
    if(v===3)art=`<path d="M-3 17-4-16H4L6 17Z" fill="${paint('wood')}"/>`+[-9,-1,7].map((y,j)=>`<path d="M1 ${y}Q-18 ${y-10}-17 ${y+1}Q-10 ${y+7} 2 ${y+4}Z" fill="${paint(j%2?'gold':'wood')}"/>`+line(`M-14 ${y+1}Q-5 ${y+5} 0 ${y+2}`,'#F6DEB5',.75)).join('');
    if(v===4)art=Array.from({length:11},(_,j)=>{const x=Math.sin(j*2.4)*12,y=8+Math.cos(j*2.1)*5;return `<ellipse cx="${x}" cy="${y}" rx="5" ry="4" fill="${paint('leaf')}"/>`+stem(`M${x} ${y}q-2-5 1-8`,.55);}).join('')+stem('M-4 4Q-8-3-5-10M5 2Q8-4 7-8',.7);
  }
  if(material==='cactus'){
    if(v===0){art=`<path d="M-4 17V-12Q-4-20 2-20Q8-20 8-12V17ZM-4 5H-10Q-16 5-16-1V-8Q-16-13-12-13Q-8-13-8-8V0H-4M8 0H11V-10Q11-14 15-14Q19-14 19-10V1Q19 7 8 7" fill="${paint('leaf')}"/>`+line('M2-15V15M-12-9V0M15-10V1','#C8DBA9',.7)+flower(2,-17,3,'petal',5);}
    if(v===1){art=[[-5,10,-15],[5,-1,25],[-9,-8,-20]].map(([x,y,a])=>`<g transform="translate(${x} ${y}) rotate(${a})"><ellipse rx="7" ry="10" fill="${paint('leaf')}"/>${[-1,1].map(side=>[-4,0,4].map(h=>line(`M${side*3-1} ${h}h2m-1-1v2`,'#E7D7AA',.5)).join('')).join('')}</g>`).join('')+flower(-8,-16,3,'gold');}
    if(v===2){art=Array.from({length:9},(_,j)=>`<path d="M0 16Q${-22+j*5} 9 ${-20+j*5} ${-12-Math.sin(j)*5}Q${-2+j*.5} 0 0 16Z" fill="${paint(j%2?'water':'leaf')}" stroke="#BAD4B3" stroke-width=".45"/>`).join('');}
    if(v===3){art=`<ellipse cy="3" rx="14" ry="16" fill="${paint('leaf')}"/>`+[-9,-4,2,8].map(x=>line(`M${x} 16Q${x-5} 0 ${x} -10`,'#C1D2A0',.8)).join('')+Array.from({length:12},(_,j)=>line(`M${Math.sin(j*2.4)*11} ${Math.cos(j*2.4)*11+3}l-1-2m1 2 2-1`,'#EAE0AF',.55)).join('')+flower(0,-12,4,'gold',8);}
    if(v===4)art=leaf(-2,16,-65,1)+leaf(2,16,65,1)+flower(0,-3,13,'petal',12)+flower(0,-3,6,'gold',7);
  }
  if(material==='coral'){
    if(v===0){art=Array.from({length:9},(_,j)=>line(`M0 17Q${(j-4)*2} -1 ${(j-4)*4} ${-12+Math.abs(j-4)*2}`,paint('petal'),1.2)).join('')+[-5,0,5].map(y=>line(`M-13 ${y}Q0 ${y+5} 13 ${y}`,'#F3C3BA',.55)).join('');}
    if(v===1)art=line('M0 18V-16M0 7-12-2V-10M0 1 12-8V-16M-6 2-17-2M5-4 5-14',paint('petal'),3.2)+line('M-.6 15V-14M-11-8V-2L-1 6','#F2BEAE',.6);
    if(v===2)art=[[-10,9,7],[0,13,13],[10,6,9]].map(([x,y,h])=>`<path d="M${x-4} ${y}V${y-h}Q${x} ${y-h-4} ${x+4} ${y-h}V${y}Z" fill="${paint('water')}"/><ellipse cx="${x}" cy="${y-h}" rx="3.7" ry="2" fill="#376B79"/><ellipse cx="${x}" cy="${y-h}" rx="2.5" ry="1" fill="#233E57"/>`).join('');
    if(v===3)art=flower(0,1,13,'petal',15)+flower(0,1,7,'gold',10)+`<circle cy="1" r="3" fill="#618C91"/>`;
    if(v===4)art=[-9,0,9].map((x,j)=>line(`M${x} 17C${x-12} 1 ${x+10} -2 ${x} ${-12-j*3}`,paint('water'),3-j*.5)).join('')+leaf(-5,10,-60,.65)+leaf(5,6,50,.65);
  }
  if(material==='pond'){
    if(v===0||v===2){art=`<ellipse cy="12" rx="19" ry="4" fill="${paint('water')}" opacity=".65"/><path d="M0 12 13 6Q22 17 3 18Q-17 19-17 10Q-15 4-2 6Z" fill="${paint('leaf')}"/>`+Array.from({length:v===0?7:5},(_,j)=>`<path transform="translate(0 8) rotate(${(j-3)*22})" d="M0 0Q-15-7 0-24Q15-7 0 0Z" fill="${paint('petal')}" stroke="#F7D6CB" stroke-width=".4"/>`).join('')+flower(0,6,4,'gold',6);}
    if(v===1)art=stem('M-4 18V-12M5 18Q12-2 8-15',1.1)+leaf(-4,18,-20,.9)+`<rect x="-6" y="-19" width="4" height="13" rx="2" fill="${paint('wood')}"/><rect x="6" y="-18" width="4" height="10" rx="2" fill="${paint('wood')}"/>`+line('M-5-17V-8','#ECC69B',.7);
    if(v===3)art=[[-8,5,10],[8,-5,9],[8,12,6]].map(([x,y,r])=>`<path transform="translate(${x} ${y})" d="M0 0 ${r*.65} ${-r*.65}A${r} ${r*.65} 0 1 0 ${r} 0Z" fill="${paint('leaf')}"/>`+line(`M${x-r*.6} ${y}H${x}l${r*.3} ${r*.4}`,'#C1D2A2',.5)).join('');
    if(v===4)art=stem('M0 18V-5')+leaf(0,18,-20,1.1)+leaf(0,17,30,1)+`<g transform="translate(0 -6)">${[-70,0,70].map(a=>`<path transform="rotate(${a})" d="M0 2Q-13-14-3-15Q2-11 0 2Z" fill="#9F9CD1"/>`).join('')}${flower(0,0,4,'gold',3)}</g>`;
  }
  if(material==='tulip'){
    if(v===0)art=tulip(0,0,'petal',-8)+leaf(0,17,50,.8);
    if(v===1)art=tulip(-8,5,'gold',-15)+`<g transform="scale(.78)">${tulip(8,-3,'gold',12)}</g>`;
    if(v===2)art=stem('M0 18Q7-2-1-17')+leaf(0,15,-55,.8)+[-12,-5,2].map((y,j)=>`<path d="M2 ${y}Q${-12+j*2} ${y-4} ${-11+j*2} ${y+4}Q${-7+j*2} ${y+8} ${-3+j*2} ${y+5}Q${-3+j*2} ${y} 2 ${y}Z" fill="#9D9BD0"/>`+line(`M${-9+j*2} ${y+4}l3 1`,'#D1C9EA',.7)).join('');
    if(v===3)art=stem('M0 17Q-3 2 0-4')+leaf(0,12,60,.7)+flower(0,-5,10,'gold',12);
    if(v===4)art=fern();
  }
  return `<g data-specimen="${types[material]?.[v]||material}" transform="scale(${(size/20).toFixed(3)})"><defs>${gradients}</defs>${art}</g>`;
}

function drawVineRings(){
  const svg=document.getElementById('ring-svg');
  if(!svg) return;
  const courses=natureCourses().slice(0,6),cx=150,cy=150;
  svg.setAttribute('width','304');svg.setAttribute('height','304');
  svg.setAttribute('viewBox','0 0 300 300');svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Weekly course progress shown as botanical wreaths');
  const pitch=92/Math.max(3,courses.length-1),band=Math.min(7,pitch*.32);
  let art='';
  courses.forEach((course,index)=>{
    const material=normalizeNatureMaterial(course.material,index),r=126-index*pitch;
    const pct=Math.max(0,Math.min(1,course.pct)),len=2*Math.PI*r,ink=course.color;
    art+=`<g class="nature-material-ring" data-course-id="${esc(course.id)}" data-material="${material}" style="--course-color:${course.color}"><title>${esc(course.name)}: ${course.done}/${course.total} assignments complete</title><circle class="nature-wreath-track" cx="${cx}" cy="${cy}" r="${nf(r)}" fill="none" stroke="var(--ring-track)" stroke-width="${nf(band)}"/>`;
    if(pct>0){
      art+=`<circle class="nature-material-progress" cx="${cx}" cy="${cy}" r="${nf(r)}" fill="none" stroke="${ink}" stroke-width="${nf(band)}" stroke-linecap="butt" stroke-dasharray="${len*pct} ${len}" transform="rotate(-90 ${cx} ${cy})"/>`;
      const arcLength=len*pct;
      const count=Math.max(1,Math.min(3,Math.floor(arcLength/13)),Math.floor(arcLength/33));
      const size=Math.min(14,pitch*.55,arcLength/count*.46);
      for(let k=0;k<count;k++){
        const a=(k+.5+Math.sin(k*2.4+index)*.13)/count*pct*2*Math.PI;
        const radius=r+Math.sin(k*1.7+index)*pitch*.06;
        const x=cx+radius*Math.sin(a),y=cy-radius*Math.cos(a);
        // Cycle distinct habitat species; size, lean and placement vary gently.
        const plant=natureSpecimenArt(material,size*(.86+.14*Math.cos(k*2.1)),k+index);
        art+=`<g transform="translate(${nf(x)} ${nf(y)}) rotate(${nf(a*180/Math.PI+Math.sin(k*2.3)*12)})"><g class="nature-sprout">${plant}</g></g>`;
      }
    }
    art+='</g>';
  });
  svg.innerHTML=art;
}

function drawTreeBars(){
  const wrap=document.getElementById('bar-chart-wrap');
  if(!wrap) return;
  wrap.classList.toggle('many-courses',state.courses.length>6);
  const species=state.treeSpecies||'oak',palette=natureSpecies(species);
  const courses=natureCourses();
  if(!courses.length){
    wrap.innerHTML='<p class="nature-chart-empty">Add a course to see weekly progress.</p>';
    return;
  }
  wrap.innerHTML=courses.map((course,index)=>{
    const pct=Math.max(0,Math.min(1,course.pct)),height=133,top=37;
    const birch=species==='birch',cherry=species==='cherry';
    const trunk=birch?'#D1CBB6':'#A38A69';
    let branches='',foliage='';
    for(let k=0;k<7;k++){
      const side=k%2?1:-1,y=top+14+k*height*.09;
      const reach=(birch?16:27)*(1-Math.abs(k-3)*.12);
      const x=50+side*reach;
      branches+=`<path d="M50 ${nf(y+23)}Q${nf(50+side*8)} ${nf(y+12)} ${nf(x)} ${nf(y)}"/>`;
      if(birch){
        for(let j=0;j<4;j++) foliage+=`<g transform="translate(${nf(x-side*j*4)} ${nf(y+j*3)}) rotate(${side*48})">${natureLeafArt(9+j,palette.leaf[(k+j)%4])}</g>`;
      }else{
        foliage+=`<ellipse cx="${nf(x-side*6)}" cy="${nf(y)}" rx="${cherry?18:19}" ry="${cherry?15:19}" fill="${palette.leaf[k%4]}"/>`;
        if(cherry) for(let j=0;j<3;j++) foliage+=`<g transform="translate(${nf(x-10+j*7)} ${nf(y-3+j%2*6)}) scale(.2)">${natureSpecimenArt('rose',12,j)}</g>`;
        else foliage+=`<path d="M${nf(x-12)} ${nf(y+2)}q8-9 16-5" fill="none" stroke="${palette.leaf[3]}" stroke-width="1.1" opacity=".6"/>`;
      }
    }
    const tree=`<g fill="none" stroke="${trunk}" stroke-width="${birch?3:4}" stroke-linecap="round"><path d="M50 173V${nf(top)}"/>${branches}</g>${foliage}`;
    const fillY=174-pct*156,clipId=`tree-progress-${index}`;
    const summary=course.total?`${Math.round(pct*100)}% · ${course.done} of ${course.total} assignments complete`:'No assignments this week';
    return `<div class="nature-tree" title="${esc(course.name)}: ${summary}">
      <span class="nature-tree-value">${course.done}/${course.total}</span>
      <svg class="nature-tree-art" viewBox="0 0 100 190" role="img" aria-label="${esc(course.name)}: ${summary}, ${species} tree">
        <defs><clipPath id="${clipId}"><rect x="0" y="${nf(fillY)}" width="100" height="${nf(pct*156)}"/></clipPath></defs>
        <g opacity=".18">${tree}</g>
        <g clip-path="url(#${clipId})">${tree}</g>
        <path d="M91 18V174" fill="none" stroke="var(--ring-track)" stroke-width="5"/>
        <path d="M87 18h8M88 57h6M88 96h6M88 135h6M87 174h8" fill="none" stroke="var(--muted)" stroke-width="1"/>
        <path d="M91 174V${nf(fillY)}" fill="none" stroke="var(--nature-rule)" stroke-width="5"/>
        ${pct>0?`<circle cx="91" cy="${nf(fillY)}" r="3.5" fill="var(--nature-rule)"/>`:''}
        <path d="M16 176H80" fill="none" stroke="var(--border)" stroke-width="1"/>
      </svg>
      <span class="nature-tree-code"><i style="background:${course.color};"></i>${esc(course.code)}</span>
      <span class="nature-tree-count">${course.total?`${course.done}/${course.total} done`:'No work'}</span>
    </div>`;
  }).join('');
}

// ─── CHART CYCLE CONTROL (single button: Circular → Bar → Hide → Circular) ───
function renderChartCycleBtn(){
  const group=document.querySelector('.chart-switch');
  const show=document.getElementById('chart-show-btn');
  const focusWasInGroup=group&&group.contains(document.activeElement);
  if(group)group.hidden=!state.chartVisible;
  if(show){
    show.hidden=state.chartVisible;
    show.title=`Show ${state.chartStyle==='bars'?'bar':'ring'} chart`;
    if(!state.chartVisible&&focusWasInGroup)show.focus({preventScroll:true});
  }
  const selected=!state.chartVisible?'hidden':state.chartStyle;
  document.querySelectorAll('[data-chart-view]').forEach(button=>{
    const active=button.dataset.chartView===selected;
    button.setAttribute('aria-pressed',String(active));
    button.tabIndex=active?0:-1;
  });
}
function selectChartView(view){
  const wasHidden=!state.chartVisible;
  if(view==='hidden'){
    if(state.chartVisible)toggleChartVisible();
  }else{
    if(!state.chartVisible)toggleChartVisible();
    setChartStyle(view);
  }
  renderChartCycleBtn();
  if(!state.chartVisible)document.getElementById('chart-show-btn')?.focus({preventScroll:true});
  if(wasHidden&&state.chartVisible)document.querySelector(`[data-chart-view="${state.chartStyle}"]`)?.focus({preventScroll:true});
}
function cycleChartControl(){
  if(!state.chartVisible){ toggleChartVisible(); setChartStyle('rings'); }
  else if(state.chartStyle==='rings'){ setChartStyle('bars'); }
  else{ toggleChartVisible(); }
}

// ─── CHART VISIBILITY TOGGLE ───
function toggleChartVisible(){
  state.chartVisible = !state.chartVisible;
  const note=document.getElementById('chart-capacity-note');
  if(note) note.textContent=state.chartVisible&&state.courses.length>(state.theme==='orbit'&&state.chartStyle==='rings'?8:6)?(state.chartStyle==='rings'?`Rings show courses 1–${state.theme==='orbit'?8:6}. Bar Chart shows every course.`:'Scroll chart to see every course.'):'';
  const chartLeft  = document.getElementById('chart-left');
  const styleBar   = document.getElementById('chart-style-bar');
  const ringInfo   = document.getElementById('ring-info');
  const chartCol   = document.getElementById('chart-col');
  renderUrgent();

  if(!state.chartVisible){
    chartLeft.classList.add('chart-hidden');
    chartCol.style.marginRight='0';
    // Move the cycle button up into ring-info while the chart itself is hidden
    if(styleBar && ringInfo){
      styleBar.style.marginTop='0';
      styleBar.style.marginBottom='8px';
      ringInfo.insertBefore(styleBar, ringInfo.firstChild);
    }
  } else {
    chartLeft.classList.remove('chart-hidden');
    chartCol.style.marginRight='18px';
    // Move the cycle button back below the chart
    if(styleBar && chartCol){
      styleBar.style.marginTop='8px';
      styleBar.style.marginBottom='0';
      chartCol.appendChild(styleBar);
    }
  }
  renderChartCycleBtn();
}
function setChartStyle(style){
  state.chartStyle=style;
  const note=document.getElementById('chart-capacity-note');
  if(note) note.textContent=state.chartVisible&&state.courses.length>(state.theme==='orbit'&&state.chartStyle==='rings'?8:6)?(style==='rings'?`Rings show courses 1–${state.theme==='orbit'?8:6}. Bar Chart shows every course.`:'Scroll chart to see every course.'):'';
  const rw=document.getElementById('ring-wrap');
  const bw=document.getElementById('bar-chart-wrap');
  if(style==='rings'){rw.classList.remove('hidden');bw.classList.remove('active');}
  else{rw.classList.add('hidden');bw.classList.add('active');}
  if(style==='rings') drawRings(); else drawBars();
  renderChartCycleBtn();
  syncTreeSpeciesVisibility();
  renderHero();
}

// ─── HERO INFO ───
// Each class contributes its next unfinished calendar-day deadline. Date-only
// Canvas keys are compared locally, so today's work stays visible all day.
function nextCourseDeadlines(courses, assignments, today = new Date()){
  const key = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  return courses.map(course=>({course, assignment:assignments
    .filter(a=>a.courseId===course.id && !a.done && /^\d{4}-\d{2}-\d{2}$/.test(a.due||'') && a.due>=key)
    .sort((a,b)=>a.due.localeCompare(b.due)||String(a.name).localeCompare(String(b.name)))[0] || null}))
    .sort((a,b)=>(a.assignment?.due||'9999').localeCompare(b.assignment?.due||'9999'));
}
function deadlineDayLabel(due, today = new Date()){
  const [year,month,day]=due.split('-').map(Number),date=new Date(year,month-1,day);
  const midnight=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const tomorrow=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
  if(date.getTime()===midnight.getTime())return 'Today';
  if(date.getTime()===tomorrow.getTime())return 'Tomorrow';
  return date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function renderNextDeadlines(){
  const list=document.getElementById('next-deadlines');
  const week=getWeekRange(state.weekStart);
  list.innerHTML=state.courses.map((course,index)=>{
    const weekly=state.assignments.filter(a=>a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
    const done=weekly.filter(a=>a.done).length;
    const marker=state.theme==='nature'
      ? `<svg class="deadline-plant" viewBox="0 0 48 48" aria-hidden="true" data-material="${normalizeNatureMaterial(course.natureMaterial,index)}"><g transform="translate(24 24)">${natureSpecimenArt(normalizeNatureMaterial(course.natureMaterial,index),19)}</g></svg>`
      : `<span class="deadline-dot" style="background:${course.color}"></span>`;
    return `<button type="button" class="next-deadline" data-course-id="${esc(course.id)}" aria-label="${esc(course.name)}: ${done}/${weekly.length} assignments complete this week. View assignments by course." title="${esc(course.name)}: ${done}/${weekly.length} assignments complete this week">
      ${marker}
      <span class="deadline-course">${esc(course.code||course.name)}</span>
      <span class="deadline-name">${esc(course.name)}</span>
      <span class="deadline-date">${done}/${weekly.length}</span>
    </button>`;
  }).join('') || '<p class="deadline-empty">No classes added yet.</p>';
}
// With the chart hidden, the room it leaves goes to the assignments that need attention first.
function renderUrgent(){
  let box=document.getElementById('urgent-list');
  if(!box){
    box=document.createElement('div');box.id='urgent-list';
    const anchor=document.getElementById('chart-capacity-note')||document.getElementById('next-deadlines');
    if(!anchor)return;
    anchor.after(box);
  }
  if(state.chartVisible){box.hidden=true;box.textContent='';return;}
  const items=state.assignments.filter(a=>!a.done&&a.due).sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,10);
  box.hidden=false;
  box.innerHTML=`<h3 class="deadline-heading">Due soon</h3>`+(items.length?items.map(a=>{
    const c=state.courses.find(x=>x.id===a.courseId);
    const {label,cls}=fmtDue(a.due,a.done);
    return `<div class="urgent-row">
      ${c?`<span class="course-tag" style="background:${c.color};color:${tagText(c.color)}">${esc(c.code)}</span>`:'<span></span>'}
      <span class="urgent-name">${esc(a.name)}</span>
      <span class="due-label ${cls}">${label}</span>
    </div>`;
  }).join(''):'<p class="deadline-empty">Nothing due. You are all caught up.</p>');
  fitUrgent();
}
// Show as many of the most urgent assignments as fit above the tabs.
function fitUrgent(){
  const box=document.getElementById('urgent-list');
  if(!box||box.hidden)return;
  const rows=[...box.querySelectorAll('.urgent-row')];
  rows.forEach(row=>{row.hidden=false;row.style.paddingBlock='';});
  // The hero adds its bottom padding and a few pixels around its content, so leave room for those above the tabs.
  const hero=document.getElementById('hero');
  const limit=document.getElementById('app').getBoundingClientRect().bottom-document.getElementById('tabs').offsetHeight-(parseFloat(getComputedStyle(hero).paddingBottom)||0)-14;
  for(let i=rows.length-1;i>0&&box.getBoundingClientRect().bottom>limit;i--)rows[i].hidden=true;
  // Share what is left over between the rows, so the list ends just above the tabs.
  const shown=rows.filter(row=>!row.hidden);
  const spare=limit-box.getBoundingClientRect().bottom;
  if(spare>0&&shown.length){
    const extra=Math.min(spare/(shown.length*2),12);
    shown.forEach(row=>{row.style.paddingBlock=`${9+extra}px`;});
  }
}
if(typeof ResizeObserver==='function'){
  const watch=()=>{const app=document.getElementById('app');if(app)new ResizeObserver(()=>fitUrgent()).observe(app);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
}
function renderHero(){
  renderNextDeadlines();

  // Explicitly identify courses beyond the six-ring artwork; every course
  // still has a legend entry and an individual bar in bar mode.
  let note=document.getElementById('chart-capacity-note');
  if(!note){note=document.createElement('div');note.id='chart-capacity-note';document.getElementById('next-deadlines').after(note);}
  note.textContent=state.chartVisible&&state.courses.length>(state.theme==='orbit'&&state.chartStyle==='rings'?8:6)?(state.chartStyle==='rings'?`Rings show courses 1–${state.theme==='orbit'?8:6}. Bar Chart shows every course.`:'Scroll chart to see every course.'):'';

  // Chart
  if(state.chartStyle==='rings') drawRings(); else drawBars();

  // Sync chart cycle button label/state
  renderChartCycleBtn();
  renderUrgent();

  // Show/hide chart containers
  const rw=document.getElementById('ring-wrap');
  const bw=document.getElementById('bar-chart-wrap');
  if(state.chartStyle==='rings'){rw.classList.remove('hidden');bw.classList.remove('active');}
  else{rw.classList.add('hidden');bw.classList.add('active');}
}

// Full content views leave the hero mounted so orbital animation timelines
// keep running while the overview is visually hidden and out of layout.
function setPanelFocus(focused){
  state.panelFocused=!!focused;
  if(!state.panelFocused){
    state.activeTab=null;
    document.querySelectorAll('.tab-btn, .panel').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach((button,index)=>{
      button.setAttribute('aria-selected','false');
      button.tabIndex=index===0?0:-1;
    });
  }
  const app=document.getElementById('app');
  app.classList.toggle('panel-focused',state.panelFocused);
  app.scrollTop=0;
  const back=document.getElementById('overview-return');
  if(back) back.hidden=!state.panelFocused;
  const hero=document.getElementById('hero');
  if(hero){
    hero.inert=state.panelFocused;
    if(state.panelFocused) hero.setAttribute('aria-hidden','true');
    else hero.removeAttribute('aria-hidden');
  }
  const body=document.getElementById('body');
  if(body) body.scrollTop=0;
}

// Move the Tech card lighting at most 24px over the full content scroll range.
function syncTechScrollGradient(){
  const body=document.getElementById('body');
  if(!body) return;
  const reduced=typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const range=body.scrollHeight-body.clientHeight;
  const progress=range>0?Math.max(0,Math.min(1,body.scrollTop/range)):0;
  body.style.setProperty('--tech-gradient-shift', (reduced?0:progress*24).toFixed(2)+'px');
}

// ─── SORT ───
function setSort(mode){
  state.sortMode=mode;
  const sel=document.getElementById('sort-select');
  if(sel) sel.value=mode;
  renderAssignments();
}

// ─── ASSIGNMENTS ───
function renderAssignments(){
  const pending=state.assignments.filter(a=>!a.done);
  const done   =state.assignments.filter(a=>a.done);

  document.getElementById('sl-pending').textContent='Assignments ('+pending.length+')';
  document.getElementById('sl-done').textContent='Assignments Completed ('+done.length+')';
  document.getElementById('sl-done').style.display=done.length?'':'none';

  if(state.sortMode==='due'){
    // Sort by due date ascending (soonest first), then no-due at end
    const sorted=[...pending].sort((a,b)=>{
      if(!a.due&&!b.due) return 0;
      if(!a.due) return 1;
      if(!b.due) return -1;
      return new Date(a.due)-new Date(b.due);
    });
    document.getElementById('list-pending').innerHTML=sorted.length
      ?sorted.map(asgnHTML).join('')
      :'<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">All caught up!</div>';
  } else {
    // Sort by course — group assignments by course order from state
    const courseOrder = state.courses.map(c => c.id);
    let html='';
    courseOrder.forEach(cid=>{
      const course=state.courses.find(c=>c.id===cid);
      if(!course) return;
      const group=pending.filter(a=>a.courseId===cid);
      html+=`<div class="course-group-header" data-course-id="${esc(cid)}" tabindex="-1">
        <div class="course-group-dot" style="background:${course.color}"></div>
        <span class="course-group-name" style="color:${course.color}">${esc(course.code)}</span>
        <span style="font-size:9px;color:var(--muted);font-weight:600;margin-left:4px">${course.name.split(':')[1]?.trim()||''}</span>
      </div>`;
      html+=group.length?group.map(asgnHTML).join(''):'<p class="deadline-empty">No pending assignments.</p>';
    });
    document.getElementById('list-pending').innerHTML=html||'<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">All caught up!</div>';
  }

  // Done always sorted by due date (most recent first)
  const sortedDone=[...done].sort((a,b)=>new Date(b.due||0)-new Date(a.due||0));
  document.getElementById('list-done').innerHTML=sortedDone.map(asgnHTML).join('');
}

// Canvas URL path segment per planner type — mirrors PLANNER_ASSIGNMENT_TYPES
// in canvas-data.js/bg.js (assignment/quiz/discussion_topic/wiki_page).
const PLANNABLE_PATH = {
  assignment: 'assignments',
  quiz: 'quizzes',
  discussion_topic: 'discussion_topics',
  wiki_page: 'pages',
};
function assignmentUrl(a){
  const seg = PLANNABLE_PATH[a.plannableType] || 'assignments';
  return `${state.origin}/courses/${a.courseId}/${seg}/${a.canvasId}`;
}

function asgnHTML(a){
  const c=state.courses.find(x=>x.id===a.courseId);
  const {label,cls}=fmtDue(a.due,a.done);
  const bg =c?c.color:'#555';
  const txt=c?tagText(c.color):'#fff';
  // Done items sit in the Completed section, where the whole row's job is
  // "click to un-complete" — no real link there (a plain div, not <a>), so
  // it can't fight with that. Only pending items link out to Canvas.
  const linkOpen  = a.done ? `<div class="asgn-link">`
                           : `<a class="asgn-link" href="${esc(assignmentUrl(a))}" target="_top" rel="noopener">`;
  const linkClose = a.done ? '</div>' : '</a>';
  return `<div class="asgn-item${a.done?' done':''}" data-id="${a.id}">
    <button type="button" class="asgn-check${a.done?' done':''}" aria-label="${esc((a.done?'Mark incomplete: ':'Mark complete: ')+a.name)}" aria-pressed="${a.done}">${a.done?'<svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>':''}</button>
    ${linkOpen}
      <div class="asgn-name">${esc(a.name)}</div>
      <div class="asgn-meta">
        ${c?`<span class="course-tag" style="background:${bg};color:${txt}">${esc(c.code)}</span>`:''}
        ${a.typeLabel?`<span class="asgn-type-label">${esc(a.typeLabel)}</span>`:''}
        ${label?`<span class="due-label ${cls}">${label}</span>`:''}
      </div>
    ${linkClose}
  </div>`;
}
function toggleAsgn(event,id){
  const a=state.assignments.find(x=>x.id===id);
  if(!a) return;
  const wasDone=a.done;
  const restoreCheckFocus=document.activeElement?.classList.contains('asgn-check');
  a.done=!a.done;
  saveAssignmentDone(a);
  syncPlannerComplete(a);
  if(!wasDone){
    const course=state.courses.find(c=>c.id===a.courseId);
    const stillPending=state.assignments.filter(x=>!x.done).length;
    if(stillPending===0){
      launchFireworks();
    } else {
      spawnConfetti(event.clientX, event.clientY, course?.color);
    }
  }
  renderAll();
  if(restoreCheckFocus){
    const row=Array.from(document.querySelectorAll('.asgn-item')).find(el=>el.dataset.id===id);
    row?.querySelector('.asgn-check')?.focus();
  }
}

// ─── CONFETTI (single assignment) ───
function spawnConfetti(x,y,courseColor){
  // Build a palette of shades from the course color + white + light tint
  const base = courseColor || '#8C1D40';
  const colors=[base, base, base, '#ffffff', '#ffffff', base+'99'];
  const count=38;
  for(let i=0;i<count;i++){
    const el=document.createElement('div');
    el.style.cssText=`position:fixed;z-index:9999;pointer-events:none;
      width:${5+Math.random()*7}px;height:${5+Math.random()*7}px;
      border-radius:${Math.random()>0.5?'50%':'2px'};
      background:${colors[Math.floor(Math.random()*colors.length)]};
      left:${x}px;top:${y}px;transform:translate(-50%,-50%);opacity:1;`;
    document.body.appendChild(el);
    const angle=Math.random()*Math.PI*2;
    const speed=80+Math.random()*180;
    const vx=Math.cos(angle)*speed;
    const vy=Math.sin(angle)*speed-(60+Math.random()*80);
    const rot=Math.random()*720-360;
    const duration=600+Math.random()*500;
    const start=performance.now();
    (function frame(now){
      const t=(now-start)/duration;
      if(t>=1){el.remove();return;}
      el.style.left=(x+vx*t)+'px';
      el.style.top=(y+vy*t+200*t*t)+'px';
      el.style.opacity=1-t;
      el.style.transform=`translate(-50%,-50%) rotate(${rot*t}deg) scale(${1-t*0.5})`;
      requestAnimationFrame(frame);
    })(performance.now());
  }
}

// ─── FIREWORKS (all assignments done) ───
function launchFireworks(){
  const ALL_COLORS=['#8C1D40','#FFC627','#78BE20','#00A3E0','#FF7F32','#E74973','#AF674B','#ffffff'];
  const W=window.innerWidth, H=window.innerHeight;
  // Launch multiple bursts across the screen
  const bursts=[
    {x:W*0.2,y:H*0.3,delay:0},
    {x:W*0.5,y:H*0.2,delay:150},
    {x:W*0.8,y:H*0.3,delay:300},
    {x:W*0.35,y:H*0.5,delay:500},
    {x:W*0.65,y:H*0.45,delay:650},
    {x:W*0.5,y:H*0.35,delay:900},
    {x:W*0.2,y:H*0.55,delay:1100},
    {x:W*0.8,y:H*0.55,delay:1250},
  ];
  bursts.forEach(({x,y,delay})=>{
    setTimeout(()=>fireworkBurst(x,y,ALL_COLORS),delay);
  });
}

function fireworkBurst(cx,cy,colors){
  const count=55;
  for(let i=0;i<count;i++){
    const el=document.createElement('div');
    const color=colors[Math.floor(Math.random()*colors.length)];
    const size=4+Math.random()*8;
    el.style.cssText=`position:fixed;z-index:9999;pointer-events:none;
      width:${size}px;height:${size}px;
      border-radius:${Math.random()>0.4?'50%':'2px'};
      background:${color};
      left:${cx}px;top:${cy}px;
      transform:translate(-50%,-50%);opacity:1;`;
    document.body.appendChild(el);
    const angle=(i/count)*Math.PI*2+Math.random()*0.3;
    const speed=100+Math.random()*220;
    const vx=Math.cos(angle)*speed;
    const vy=Math.sin(angle)*speed-80;
    const rot=Math.random()*900-450;
    const duration=800+Math.random()*600;
    const start=performance.now();
    (function frame(now){
      const t=(now-start)/duration;
      if(t>=1){el.remove();return;}
      const ease=1-t;
      el.style.left=(cx+vx*t)+'px';
      el.style.top=(cy+vy*t+300*t*t)+'px';
      el.style.opacity=ease*ease;
      el.style.transform=`translate(-50%,-50%) rotate(${rot*t}deg) scale(${0.5+ease*0.8})`;
      requestAnimationFrame(frame);
    })(performance.now());
  }
}

// ─── GRADES ───

// ─── GRADE BREAKDOWN (weighted categories + "score needed") ───
// Default target = the next letter-grade threshold above the current grade, so
// the calculator answers "what do I need to reach the next letter?".
function defaultTarget(c){
  const g = c.grade==null ? null : parseFloat(c.grade);
  if(g==null) return 90;
  const higher = scaleFor(c).map(s=>s.min).filter(m=>m>g+0.001).sort((a,b)=>a-b)[0];
  return higher!=null ? Math.round(higher) : 100;
}
// Given a target course %, how much is needed on remaining work?
// final% = projA + f·projB, so f = (target − projA)/projB.
function computeNeeded(c, target){
  const bd=c.breakdown; if(!bd) return null;
  const t=parseFloat(target); if(isNaN(t)) return null;
  const maxPossible=bd.projA+bd.projB, minPossible=bd.projA;
  if(bd.projB<=0.0001) return {none:true, maxPossible, minPossible};
  return {neededPct:(t-bd.projA)/bd.projB*100, maxPossible, minPossible};
}
function needText(need, bd){
  if(!need || !bd) return '';
  if(need.none) return 'All work graded';
  if(need.neededPct<=0.5) return 'Secured ✓';
  if(need.neededPct>100.5) return `Not reachable (max ${need.maxPossible.toFixed(1)}%)`;
  return `Need ${need.neededPct.toFixed(0)}% on remaining ${bd.pointsRemaining} pts`;
}
function breakdownHTML(c){
  const bd=c.breakdown;
  if(!bd || !bd.categories.length) return '';
  const open=c.breakdownOpen===true;
  const cats=bd.categories.map(cat=>{
    const your=cat.yourPct==null ? '—' : cat.yourPct.toFixed(0)+'%';
    const mean=cat.classMean==null ? '' : `<span class="bd-mean">avg ${cat.classMean.toFixed(0)}%</span>`;
    // Canvas drop rules (drop_lowest/drop_highest) — these scores are excluded
    // from every figure above, matching Canvas's own grade math.
    const droppedNames=(cat.droppedAssignments||[]).map(d=>d.name);
    const droppedLine=droppedNames.length
      ? `<div class="bd-dropped" title="${esc(droppedNames.join(', '))}">Dropped: ${esc(droppedNames.join(', '))}</div>`
      : '';
    return `<div class="bd-row">
      <span class="bd-cat">${esc(cat.name)}</span>
      <span class="bd-weight">${cat.weightPct.toFixed(0)}%</span>
      <span class="bd-your" style="color:${textColor(c.color)}">${your}</span>
      ${mean}
    </div>${droppedLine}`;
  }).join('');
  const target=c.bdTarget!=null ? c.bdTarget : defaultTarget(c);
  const needTxt=needText(computeNeeded(c, target), bd);
  const weightedNote = (bd.weighted && bd.computedGrade!=null)
    ? `<div class="bd-note">Weighted grade: <strong style="color:${textColor(c.color)}">${bd.computedGrade.toFixed(1)}%</strong></div>`
    : '';
  // Canvas-configured drops show per-category above. When none exist but the
  // syllabus text mentions a drop policy, surface it as info only — without a
  // real Canvas rule it can't (and shouldn't) change the math.
  const anyDrops=bd.categories.some(cat=>(cat.droppedAssignments||[]).length);
  const sylDropNote=(!anyDrops && c.droppedNote)
    ? `<div class="bd-note" style="font-weight:500">Syllabus mentions: ${esc(c.droppedNote)}. Not set up as a Canvas rule, so figures here don't reflect it.</div>`
    : '';
  return `<div class="grade-bd">
    <button type="button" class="bd-toggle" data-bdtoggle="${c.id}" aria-expanded="${open}" aria-controls="bd-body-${c.id}">
      <span>Grade Breakdown</span>
      <span class="bd-caret" style="transform:rotate(${open?'0':'180'}deg)"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
    </button>
    <div class="bd-body" id="bd-body-${c.id}" style="display:${open?'block':'none'}">
      ${cats}
      ${sylDropNote}
      ${weightedNote}
      <div class="bd-target-row">
        <span class="bd-target-label">Target</span>
        <input type="number" class="bd-target-inp" aria-label="Target grade for ${esc(c.name)}" min="0" max="110" step="1" value="${target}" data-bdtarget="${c.id}">
        <span class="bd-need" id="bd-need-${c.id}">${needTxt}</span>
      </div>
    </div>
  </div>`;
}

// Status note for file-based syllabus extraction (canvas-data.js
// augmentSyllabusFromFile) — shown in the Syllabus Analysis slot while the
// linked PDF/DOCX is being read, or when it couldn't be read. Success renders
// the normal analysis card instead (rubricData gets set), so 'done' never
// reaches here.
function syllabusFileNoteHTML(c, syllabusUrl){
  if(!c.syllabusFileId || c.rubricData) return '';
  const link = syllabusUrl
    ? ` <a href="${syllabusUrl}" target="_blank" style="color:var(--accent);font-weight:700;text-decoration:none">Open syllabus ↗</a>` : '';
  let msg;
  if(c.syllabusFileStatus==='reading')          msg='Reading syllabus file…';
  else if(c.syllabusFileStatus==='nothing')     msg='No grading info found in the syllabus file.'+link;
  else if(c.syllabusFileStatus==='unreadable')  msg="Couldn't auto-read the syllabus file (scanned or unsupported format)."+link;
  else if(c.syllabusFileStatus==='failed')      msg="Couldn't download the syllabus file."+link;
  else return '';
  return `<div style="margin-top:8px;padding:6px 10px;background:var(--input-bg);border:1px solid var(--border);border-radius:9px;font-size:10px;color:var(--muted);">${msg}</div>`;
}

// Shared medallion disc: rim ring + lit radial gradient, plus the clip path and
// drop shadow the texture/ornament layers reference.
function natureMaterialMedallionSVG(material,ctx){
  const mat=normalizeNatureMaterial(material,0);
  return `<svg class="nature-material-art" viewBox="0 0 48 48" aria-hidden="true"><circle class="nature-specimen-disc" cx="24" cy="24" r="21"/><g class="orn-main" transform="translate(24 24)">${natureSpecimenArt(mat,16)}</g></svg>`;
}

function natureMaterialPickerHTML(course,courseIndex){
  const selected=normalizeNatureMaterial(course.natureMaterial,courseIndex);
  const names={
    rose:'Rose vine',log:'Mossy log',cactus:'Flowering cactus',
    coral:'Sand and coral',pond:'Lily pond',tulip:'Dutch tulip field',
  };
  return `<div class="nature-material-picker" role="group" aria-label="Chart plant for ${esc(course.name)}">
    <div class="nature-material-picker-label">Chart plant</div>
    <div class="nature-material-options">
      ${NATURE_MATERIALS.map(material=>`<button type="button"
        class="nature-material-option${material===selected?' selected':''}"
        data-nature-course="${course.id}" data-nature-material="${material}"
        aria-label="${names[material]}" aria-pressed="${material===selected?'true':'false'}"
        title="${names[material]}">${natureMaterialMedallionSVG(material,course.id)}</button>`).join('')}
    </div>
  </div>`;
}

function formatGradeTrendDate(dateKey){
  const match=String(dateKey||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}` : '';
}
function gradeTrendColor(score){
  const value=Number(score);
  if(value>=80) return '#78BE20';
  if(value>=70) return '#FFC627';
  return '#E74973';
}
function filterGradeTrendPoints(points,weekStartDay,refDate){
  const range=getWeekRange(weekStartDay,refDate);
  return (points||[]).filter(point=>point.date>=range.start&&point.date<=range.end);
}
function gradeTrendWeekDates(range){
  const parts=range.start.split('-').map(Number);
  const start=new Date(parts[0],parts[1]-1,parts[2]);
  const dates=[];
  for(let i=0;i<7;i++){
    const day=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
    dates.push(day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0'));
  }
  return dates;
}
function gradeTrendMenuHTML(course){
  return `<button type="button" class="grade-card-menu-btn grade-trend-launch" data-grade-trend="${course.id}"
    aria-label="View ${esc(course.name)} grade trend" title="Grade trend">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 4v16h16M7 15l4-5 4 3 5-8"/>
    </svg>
  </button>`;
}
function bindGradeTrendTooltips(container){
  const shell=container.querySelector('.grade-trend-chart-shell');
  const tooltip=container.querySelector('.grade-trend-tooltip');
  if(!shell||!tooltip) return;
  const nameEl=tooltip.querySelector('strong');
  const metaEl=tooltip.querySelector('span');
  const place=(point,clientX,clientY)=>{
    const shellRect=shell.getBoundingClientRect();
    const pointRect=point.getBoundingClientRect();
    const x=clientX==null ? pointRect.left+pointRect.width/2 : clientX;
    const y=clientY==null ? pointRect.top : clientY;
    nameEl.textContent=point.dataset.name;
    metaEl.textContent=`${point.dataset.score} · ${point.dataset.date}`;
    tooltip.hidden=false;
    const half=Math.min(92,Math.max(60,tooltip.offsetWidth/2));
    tooltip.style.left=Math.max(half+6,Math.min(shellRect.width-half-6,x-shellRect.left))+'px';
    tooltip.style.top=Math.max(tooltip.offsetHeight+8,y-shellRect.top-10)+'px';
  };
  const hide=()=>{tooltip.hidden=true;};
  container.querySelectorAll('.grade-trend-point').forEach(point=>{
    point.addEventListener('pointerenter',e=>place(point,e.clientX,e.clientY));
    point.addEventListener('pointermove',e=>place(point,e.clientX,e.clientY));
    point.addEventListener('pointerleave',hide);
    point.addEventListener('focus',()=>place(point));
    point.addEventListener('blur',hide);
  });
}
function gradeTrendViewHTML(course){
  const range=getWeekRange(state.weekStart);
  const dates=gradeTrendWeekDates(range);
  const points=filterGradeTrendPoints(course.gradeTrend,state.weekStart);
  const average=points.length
    ? points.reduce((sum,point)=>sum+point.scorePct,0)/points.length
    : null;

  const width=360, height=232, left=42, right=14, top=18, bottom=38;
  const plotWidth=width-left-right, plotHeight=height-top-bottom;
  const xFor=date=>left+(dates.indexOf(date)*(plotWidth/6));
  const yFor=score=>top+((100-score)/100)*plotHeight;
  const dayGroups={};
  points.forEach(point=>{
    if(!dayGroups[point.date]) dayGroups[point.date]=[];
    dayGroups[point.date].push(point);
  });

  const yTicks=[100,80,60,40,20,0].map(value=>{
    const y=yFor(value);
    return `<g class="grade-trend-grid-row">
      <line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/>
      <text x="${left-8}" y="${y+3}" text-anchor="end">${value}</text>
    </g>`;
  }).join('');
  const xTicks=dates.map(date=>{
    const x=xFor(date);
    return `<g class="grade-trend-x-tick">
      <line x1="${x}" y1="${height-bottom}" x2="${x}" y2="${height-bottom+4}"/>
      <text x="${x}" y="${height-14}" text-anchor="middle">${formatGradeTrendDate(date)}</text>
    </g>`;
  }).join('');
  const averageLine=average==null ? '' : `<g class="grade-trend-average">
    <line x1="${left}" y1="${yFor(average)}" x2="${width-right}" y2="${yFor(average)}"/>
    <text x="${width-right-2}" y="${yFor(average)-5}" text-anchor="end">avg ${Math.round(average)}</text>
  </g>`;
  const pointMarkup=points.map(point=>{
    const group=dayGroups[point.date];
    const index=group.indexOf(point);
    const step=Math.min(10,44/Math.max(1,group.length-1));
    const offset=(index-(group.length-1)/2)*step;
    const dayIndex=dates.indexOf(point.date);
    const edgeShift=group.length>1 ? (dayIndex===0?22:dayIndex===6?-22:0) : 0;
    const x=xFor(point.date)+offset+edgeShift;
    const y=yFor(point.scorePct);
    const score=Math.round(point.scorePct);
    const radius=Math.min(5,Math.max(2,step/2-.4));
    return `<g class="grade-trend-point" tabindex="0" role="img"
      aria-label="${esc(point.name)}, ${score} percent on ${formatGradeTrendDate(point.date)}"
      data-name="${esc(point.name)}" data-score="${score}%" data-date="${formatGradeTrendDate(point.date)}">
      <circle class="grade-trend-point-halo" cx="${x}" cy="${y}" r="${radius+3}"/>
      <circle class="grade-trend-point-dot" cx="${x}" cy="${y}" r="${radius}" fill="${gradeTrendColor(point.scorePct)}"/>
      <title>${esc(point.name)}</title>
    </g>`;
  }).join('');

  return `<div class="grade-trend-view">
    <button type="button" class="grade-trend-back" data-grade-trend-back>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6"/>
      </svg>
      <span>All classes</span>
    </button>
    <div class="grade-trend-heading">
      <div class="grade-trend-eyebrow"><span style="background:${course.color}"></span>Weekly grade trend</div>
      <h2>${esc(course.name)}</h2>
      <p>${range.display}</p>
    </div>
    <div class="grade-trend-card" style="--trend-course:${course.color}">
      <div class="grade-trend-current grade-score-line"><span>${course.grade==null?'—':Number(course.grade).toFixed(1)+'%'}</span>${gradeChangeHTML(course)}<span class="grade-trend-current-label">Current grade</span></div>
      <div class="grade-trend-summary">
        <div><strong>${points.length}</strong><span>grade${points.length===1?'':'s'} received</span></div>
        <div><strong>${average==null?'—':Math.round(average)+'%'}</strong><span>weekly average</span></div>
      </div>
      <div class="grade-trend-chart-label">Score (%)</div>
      <div class="grade-trend-chart-shell">
        <svg class="grade-trend-chart" viewBox="0 0 ${width} ${height}" role="img"
          aria-label="${esc(course.name)} assignment scores from ${range.display}">
          ${yTicks}${xTicks}${averageLine}${pointMarkup}
        </svg>
        ${points.length?'':`<div class="grade-trend-empty">No grades received this week yet.</div>`}
        <div class="grade-trend-tooltip" role="tooltip" hidden><strong></strong><span></span></div>
      </div>
      <div class="grade-trend-legend" aria-label="Score color key">
        <span><i class="green"></i>80+</span><span><i class="yellow"></i>70–79</span><span><i class="red"></i>Below 70</span>
      </div>
      <p class="grade-trend-note">A point appears after Canvas posts a grade. Its date is the submission day, or the due day when no submission date is available.</p>
    </div>
  </div>`;
}

function gradeChangeHTML(course){
  const current=Number(course.grade),previous=Number(course.prevGrade);
  if(course.grade==null||course.prevGrade==null||!Number.isFinite(current)||!Number.isFinite(previous)||current===previous){
    return '<span class="grade-change is-flat" aria-label="No grade change">—</span>';
  }
  const up=current>previous;
  const label=`Grade ${up?'increased':'decreased'} by ${Number(Math.abs(current-previous).toFixed(2))} percentage points since the previous update`;
  return `<span class="grade-change ${up?'is-up':'is-down'}" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 16 20" aria-hidden="true" fill="none" stroke="currentColor"><path d="${up?'M8 17V3M2 9l6-6 6 6':'M8 3v14M2 11l6 6 6-6'}"/></svg></span>`;
}

function renderGrades(){
  const container=document.getElementById('class-cards');
  if(!container)return;

  const tutoring=document.getElementById('tutoring-link');
  const selectedCourse=state.gradeTrendCourseId
    ? state.courses.find(course=>course.id===state.gradeTrendCourseId)
    : null;
  if(state.gradeTrendCourseId&&!selectedCourse) state.gradeTrendCourseId=null;
  if(selectedCourse){
    if(tutoring) tutoring.style.display='';
    container.innerHTML=gradeTrendViewHTML(selectedCourse);
    bindGradeTrendTooltips(container);
    return;
  }
  if(tutoring) tutoring.style.display='';

  const displayOrder = state.courses.map(c => c.id);

  container.innerHTML=displayOrder.map((cid,courseIndex)=>{
    const c=state.courses.find(x=>x.id===cid);
    if(!c) return '';
    const scale=scaleFor(c);
    const l=courseLetter(c,scale);
    const pend=state.assignments.filter(a=>a.courseId===c.id&&!a.done).length;
    const hasCustom=!!c.customScale;

    const syllabusUrl = (state.canvasOrigin && c.canvasId)
      ? `${state.canvasOrigin}/courses/${c.canvasId}/assignments/syllabus` : null;
    const announceUrl = (state.canvasOrigin && c.canvasId)
      ? `${state.canvasOrigin}/courses/${c.canvasId}/announcements` : null;

    const analysisHTML = c.rubricData
      ? `<div style="margin-top:8px;">
           <button type="button" class="syllabus-toggle" data-syllabus="${c.id}" aria-expanded="${c.syllabusOpen===true}" aria-controls="syllabus-body-${c.id}" style="display:flex;align-items:center;justify-content:space-between;background:var(--input-bg);border:1px solid var(--border);border-radius:9px;padding:6px 10px;cursor:pointer;transition:border-color 0.15s">
             <span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted);">Syllabus${hasCustom?' · Custom scale':''}</span>
             <span style="color:var(--muted);transition:transform 0.2s;display:inline-flex;transform:rotate(${c.syllabusOpen===true?'0':'180'}deg);"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
           </button>
           <div id="syllabus-body-${c.id}" style="display:${c.syllabusOpen===true?'block':'none'};">
             <div class="syllabus-result visible" style="margin-top:6px;border-radius:9px;">
               <div class="syllabus-result-header">
                 <div class="syllabus-result-title">Syllabus Analysis${hasCustom?' · Custom scale applied':''}</div>
                 ${syllabusUrl ? `<a href="${syllabusUrl}" target="_blank" class="syllabus-open-btn">Open ↗</a>` : ''}
               </div>
               ${esc(c.rubricData)}
               <br>
               <button class="syllabus-clear" data-reanalyze="${c.id}">Re-analyze</button>
               <button class="syllabus-clear" data-clearrubric="${c.id}">Reset to default scale</button>
             </div>
           </div>
         </div>`
      : syllabusFileNoteHTML(c, syllabusUrl);

    return `<div class="grade-card" style="border-color:${c.color}">
      <div class="grade-card-left" style="background:${c.color}"></div>
      <div class="grade-card-main">
        <div class="grade-card-heading">
          <div class="grade-card-title">${esc(c.name)}</div>
          ${gradeTrendMenuHTML(c)}
        </div>
        <div class="grade-stats-row">
          <div class="gstat-box narrow" style="${statTint(c.color)}">
            <div class="gstat-v" style="color:${textColor(c.color)}">${l}</div>
            <div class="gstat-k">Grade</div>
          </div>
          <div class="gstat-box narrow" style="${statTint(c.color)}">
            <div class="grade-score-line">
              <span class="gstat-v" style="color:${textColor(c.color)};margin-bottom:0">${c.grade===null?'N/A':Math.round(parseFloat(c.grade))}</span>
              ${gradeChangeHTML(c)}
            </div>
            <div class="gstat-k">Score</div>
          </div>
          <div class="gstat-box wide" style="${statTint(c.color)}">
            <div class="gstat-v" style="color:${textColor(c.color)}">${pend}</div>
            <div class="gstat-k">Assignments</div>
          </div>
          <!-- Announcements — navigates the host Canvas page (target=_top) to
               this course's announcements; plain non-link box if origin unknown -->
          ${announceUrl
            ? `<a class="announce-btn" href="${announceUrl}" target="_top" title="Open course announcements" style="${statTint(c.color)}">`
            : `<div class="announce-btn" title="Announcements unavailable" style="${statTint(c.color)}">`}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${textColor(c.color)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:3px;">
              <path d="M3 11l16-8v18L3 13v-2z"/>
              <path d="M11.5 11.5L11.5 20"/>
              <path d="M11.5 20H8"/>
            </svg>
            <div class="announce-label">Announcements</div>
          ${announceUrl ? '</a>' : '</div>'}
        </div>
        <details class="course-options" data-course-options="${esc(c.id)}" ${c.optionsOpen?'open':''}>
          <summary aria-label="${state.theme==='nature'?'Design':'Color'}, breakdown and syllabus for ${esc(c.name)}">Course options<span class="course-options-caret" aria-hidden="true"></span></summary>
          <div class="course-options-body">
            <details class="course-theme-options" data-course-theme="${esc(c.id)}" ${c.themeOptionsOpen?'open':''}>
              <summary>${state.theme==='nature'?'Design':'Color'}<span class="course-options-caret" aria-hidden="true"></span></summary>
              ${state.theme==='nature' ? natureMaterialPickerHTML(c,courseIndex) : `<div class="grade-card-swatches" id="gcp-${c.id}" role="group" aria-label="Course color for ${esc(c.name)}"></div>`}
            </details>
            ${breakdownHTML(c) || '<p class="course-option-empty">No grade breakdown available yet.</p>'}
            ${c.rubricData ? analysisHTML : `<details class="course-syllabus-options"><summary>Syllabus<span class="course-options-caret" aria-hidden="true"></span></summary>${analysisHTML || '<p class="course-option-empty">No syllabus available yet.</p>'}</details>`}
          </div>
        </details>
      </div>

    </div>`;
  }).join('');

  // Native dropdowns keep their state when a course color or plant re-renders the cards.
  container.querySelectorAll('[data-course-options], [data-course-theme]').forEach(details=>{
    details.addEventListener('toggle',()=>{
      const course=state.courses.find(c=>c.id===(details.dataset.courseOptions||details.dataset.courseTheme));
      if(course)course[details.hasAttribute('data-course-options')?'optionsOpen':'themeOptionsOpen']=details.open;
    });
  });

  container.querySelectorAll('.nature-material-option').forEach(button=>{
    button.addEventListener('click',()=>updateNatureMaterial(
      button.dataset.natureCourse,
      button.dataset.natureMaterial
    ));
  });

  // Build color swatches for each card
  displayOrder.forEach(cid=>{
    const c=state.courses.find(x=>x.id===cid);
    if(!c) return;
    const wrap=document.getElementById('gcp-'+c.id);
    if(!wrap) return;
    wrap.innerHTML='';
    COLORS.forEach(col=>{
      const d=document.createElement('button');
      d.type='button';
      d.className='gcp-swatch'+(col===c.color?' selected':'');
      d.style.background=col;
      d.dataset.courseColor=c.id;
      d.dataset.color=col;
      d.setAttribute('aria-label','Use '+col+' for '+c.name);
      d.setAttribute('aria-pressed',String(col===c.color));
      d.onclick=()=>updateColor(c.id,col);
      wrap.appendChild(d);
    });
  });
}

function toggleGradeMenu(id){
  state.gradeMenuCourseId=state.gradeMenuCourseId===id ? null : id;
  document.querySelectorAll('.grade-card-menu-wrap').forEach(wrap=>{
    const button=wrap.querySelector('[data-grade-menu]');
    const menu=wrap.querySelector('.grade-card-menu');
    const open=!!button&&button.dataset.gradeMenu===state.gradeMenuCourseId;
    if(button) button.setAttribute('aria-expanded',String(open));
    if(menu) menu.classList.toggle('open',open);
  });
}
function openGradeTrend(id){
  if(!state.courses.some(course=>course.id===id)) return;
  state.gradeMenuCourseId=null;
  state.gradeTrendCourseId=id;
  renderGrades();
  const body=document.getElementById('body');
  if(body) body.scrollTop=0;
}
function closeGradeTrend(){
  state.gradeTrendCourseId=null;
  renderGrades();
  const body=document.getElementById('body');
  if(body) body.scrollTop=0;
}

function toggleSyllabus(id){
  const c=state.courses.find(x=>x.id===id);
  if(!c) return;
  const restoreFocus=document.activeElement?.dataset.syllabus===id;
  c.syllabusOpen = c.syllabusOpen!==true;
  renderGrades();
  if(restoreFocus)Array.from(document.querySelectorAll('[data-syllabus]')).find(el=>el.dataset.syllabus===id)?.focus();
}
function updateColor(id,col){
  const c=state.courses.find(x=>x.id===id);
  const restoreFocus=document.activeElement?.dataset.courseColor===id;
  if(c){
    c.color=col;renderAll();saveColors();
    if(restoreFocus)Array.from(document.querySelectorAll('.gcp-swatch')).find(el=>el.dataset.courseColor===id&&el.dataset.color===col)?.focus();
  }
}
function updateNatureMaterial(id,material){
  if(!isNatureMaterial(material)) return;
  const c=state.courses.find(x=>x.id===id);
  if(!c) return;
  c.natureMaterial=material;
  renderGrades();
  if(state.theme==='nature'){ drawRings(); renderNextDeadlines(); }
  saveNatureMaterials();
}
function saveNatureMaterials(){
  const materials={};
  state.courses.forEach((course,index)=>{
    materials[course.id]=isNatureMaterial(course.natureMaterial)
      ? course.natureMaterial
      : natureRingMaterial(index);
  });
  try{chrome.storage.local.set({cc_nature_materials:materials});}catch(e){}
}
// ─── COURSE COLOR PERSISTENCE ───
// Mirrors saveCredits() below: canvas-data.js reads cc_colors back on load
// and prioritizes it over Canvas's own dashboard color.
function saveColors(){
  const colors={};
  state.courses.forEach(c=>{ colors[c.id]=c.color; });
  chrome.storage.local.set({cc_colors:colors});
}
function clearRubric(id){
  const c=state.courses.find(x=>x.id===id);
  if(!c) return;
  c.rubricData=null;c.customScale=null;
  renderAll();
}

// ─── SYLLABUS AUTO-PARSE (local heuristics, see syllabus-parser.js) ───
// Re-runs extraction against the already-fetched syllabus_body — useful if an
// instructor edits the syllabus mid-semester and the user wants a fresh parse
// without waiting for the next full Canvas data refresh. When the syllabus is
// an uploaded file, redo the whole file pipeline (fetch + extract, bypassing
// the text cache) instead of just the local HTML heuristic.
function reanalyzeSyllabus(courseId){
  const course=state.courses.find(c=>c.id===courseId);if(!course)return;
  if(course.syllabusFileId && typeof augmentSyllabusFromFile==='function'){
    course.syllabusFileStatus='reading';
    renderGrades();
    augmentSyllabusFromFile(course, true); // re-renders when done
    return;
  }
  const result=parseSyllabus(course.syllabusBody);
  course.rubricData=result.summary;
  course.customScale=result.gradingScale;
  course.droppedNote=result.droppedNote;
  renderAll();
}

// ─── CREDIT HOURS PERSISTENCE ───
function saveCredits(){
  const credits={};
  state.courses.forEach(c=>{ credits[c.id]=c.credits; });
  chrome.storage.local.set({cc_credits:credits});
}

// ─── ASSIGNMENT DONE PERSISTENCE ───
// Manual check/uncheck overrides live in cc_done keyed by courseId:canvasId
// (the render id `a<N>` is regenerated every load, so it can't be the key).
// canvas-data.js merges these over Canvas's own submission state on load and
// prunes any entry once Canvas independently agrees with it.
function saveAssignmentDone(a){
  const key = a.courseId + ':' + a.canvasId;
  chrome.storage.local.get(['cc_done'], (r)=>{
    const done = r.cc_done || {};
    done[key] = a.done;
    chrome.storage.local.set({cc_done: done});
  });
}

// Also push the check/uncheck into Canvas's own planner via bg.js, so it
// syncs across devices and Canvas's native To-Do list. Best-effort — if it
// fails (offline, no CSRF cookie, demo data) the local cc_done save above
// still keeps the panel correct on this machine.
function syncPlannerComplete(a){
  if(!a.plannableType || !a.canvasId) return; // not a live planner item
  try{
    chrome.runtime.sendMessage({
      type:           'SET_PLANNER_COMPLETE',
      origin:         state.canvasOrigin,
      plannableType:  a.plannableType,
      plannableId:    a.canvasId,
      overrideId:     a.overrideId,
      markedComplete: a.done,
    }, (resp)=>{
      if (chrome.runtime.lastError) return;      // service worker unavailable
      if (resp && resp.ok && resp.overrideId) a.overrideId = resp.overrideId;
    });
  }catch(e){ /* orphaned extension context — local save already done */ }
}

// ─── GPA CALCULATIONS (ASU formula: honor pts ÷ graded units, capped 4.00) ───
function capGPA(n){ return Number.isFinite(n) ? Math.min(Math.max(Number(n.toFixed(2)), 0), 4.00) : 0; }
function gpaCredits(c){ const n=Number(c.credits); return Number.isFinite(n)&&n>0?n:0; }
// Passing, withdrawn, incomplete and audit grades are not GPA-bearing.
function excludedFromGpa(c){ return /^(P|Y|S|U|W|I|X|NR|NG|AU|AUDIT)$/i.test(String(c.gradeLabel||'').trim()); }
function courseGpaPoints(c){
  if(excludedFromGpa(c))return null;
  const label=String(c.gradeLabel||'').trim().toUpperCase();
  if(/^(E|EN|EU|XE|F)$/.test(label))return 0;
  const letter=canvasLetter(c);
  if(letter){const g=scaleFor(c).find(g=>g.l===letter)||GPA_SCALE_DEFAULT.find(g=>g.l===letter);if(g)return g.pts;}
  if(c.grade===null||c.grade===undefined||String(c.grade).trim()==='')return null;
  const grade=Number(c.grade);
  return Number.isFinite(grade)?pctToPts(grade,scaleFor(c)):null;
}

// Transcript values pasted from my.asu.edu may carry comma thousands
// separators ("1,234.000"); tolerate them rather than parsing to NaN.
function parseGpaNumber(str){
  const n = Number(String(str ?? '').replace(/,/g,'').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Badge for one course row in the goal calculator: the minimum letter grade on
// this course's scale that meets the needed per-credit average, always shown so
// the user can see the target — plus whether the current grade already meets it.
// grade may be null (course not yet graded). Returns {cls, text}.
function goalBadge(avgNeededPPC, grade, scale, actualPoints = null){
  const asc    = [...scale].sort((a,b)=>a.pts-b.pts);
  const needed = asc.find(s=>s.pts>=avgNeededPPC-1e-9);
  if(!needed) return {cls:'impossible', text:'Not attainable this semester'};
  if(avgNeededPPC<=1e-9) return {cls:'ok', text:'Any grade ✓'};
  const g = parseFloat(grade);
  const points=actualPoints ?? (grade!==null && !isNaN(g) ? pctToPts(g,scale) : null);
  if(points!==null && points>=avgNeededPPC-1e-9){
    return {cls:'ok', text:'Need '+needed.l+' · on track ✓'};
  }
  return {cls:'warn', text:'Need '+needed.l};
}

function getTranscriptValues(){
  const hp = parseGpaNumber(document.getElementById('gpa-honor-pts')?.value);
  const gu = parseGpaNumber(document.getElementById('gpa-graded-units')?.value);
  return {hp: gu > 0 ? hp : 0, gu};
}

// ─── GPA INPUT PERSISTENCE ───
function saveGpaInputs(){
  const vals = {};
  ['gpa-honor-pts','gpa-graded-units','gpa-goal-input'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) vals[id] = el.value;
  });
  chrome.storage.local.set({cc_gpa: vals});
}
function restoreGpaInputs(cb){
  chrome.storage.local.get(['cc_gpa'], (r)=>{
    const vals = r.cc_gpa || {};
    Object.keys(vals).forEach(id=>{
      const el = document.getElementById(id);
      if (el && vals[id] !== '' && vals[id] != null) el.value = vals[id];
    });
    if (cb) cb();
  });
}

function recalcAll(){
  const {hp, gu} = getTranscriptValues();
  const hasTranscript = gu > 0;
  const currentGPA = hasTranscript ? capGPA(hp/gu) : 0;

  // Update current GPA display — "—" until the user enters transcript values
  const cur = document.getElementById('gpa-current-display');
  if(cur) cur.textContent = hasTranscript ? currentGPA.toFixed(2) : '—';

  // Current projections use only graded, GPA-bearing units. Ungraded courses
  // remain available to the separate end-of-term goal calculation.
  const eligible = state.courses.filter(c=>!excludedFromGpa(c)&&gpaCredits(c)>0);
  const graded = eligible.filter(c=>courseGpaPoints(c)!==null);
  const termHP = graded.reduce((s,c)=>s+courseGpaPoints(c)*gpaCredits(c),0);
  const termCr = graded.reduce((s,c)=>s+gpaCredits(c),0);
  const totalCr = gu + termCr;
  const goalTotalCr = gu + eligible.reduce((s,c)=>s+gpaCredits(c),0);
  const eotGPA = totalCr>0 ? capGPA((hp+termHP)/totalCr) : currentGPA;
  const delta   = parseFloat((eotGPA - currentGPA).toFixed(2));

  // Update EOT display
  const eotEl = document.getElementById('gpa-eot-display');
  if(eotEl) eotEl.textContent = eotGPA.toFixed(2);
  const subEl = document.getElementById('gpa-eot-sub');
  if(subEl) subEl.textContent = `${termCr.toFixed(2)} graded term credits · ungraded courses excluded · capped at 4.00`;

  const badge = document.getElementById('gpa-delta-badge');
  if(badge){
    if(!hasTranscript){badge.className='gpa-delta-badge flat';badge.textContent='';badge.style.display='none';}
    else{
      badge.style.display='';
      if(delta>0){badge.className='gpa-delta-badge up';badge.textContent='+'+delta.toFixed(2);}
      else if(delta<0){badge.className='gpa-delta-badge down';badge.textContent=delta.toFixed(2);}
      else{badge.className='gpa-delta-badge flat';badge.textContent='No change';}
    }
  }

  // Course list in EOT card
  const listEl = document.getElementById('gpa-course-list');
  if(listEl){
    listEl.innerHTML = state.courses.map(c=>{
      const scale=scaleFor(c);
      const pts = courseGpaPoints(c);
      const hasGrade = pts !== null;
      const l = excludedFromGpa(c) ? String(c.gradeLabel) : canvasLetter(c) || courseLetter(c, scale);
      return `<div class="gpa-crs-row">
        <div class="gpa-crs-dot" style="background:${c.color}"></div>
        <div class="gpa-crs-name">${esc(c.name)}</div>
        <input class="gpa-crs-credits-input" type="number" min="0.5" max="9" step="0.5"
          value="${c.credits}" data-creditcourse="${esc(c.id)}" title="Edit credit hours">
        <span class="gpa-crs-pct">${hasGrade && c.grade!==null && Number.isFinite(Number(c.grade)) ? Number(c.grade).toFixed(1)+'%' : 'N/A'}</span>
        <div class="gpa-letter-wrap">
          <span class="gpa-crs-letter" style="color:${textColor(c.color)}">${l.charAt(0)}</span><span class="gpa-crs-letter-mod" style="color:${textColor(c.color)}">${l.slice(1)||''}</span>
        </div>
        <span class="gpa-crs-pts">${pts !== null ? pts.toFixed(2) : '—'}</span>
      </div>`;
    }).join('');
  }

  // Goal calculator — needs at least some credits (transcript or term) to
  // divide by; otherwise show a hint instead of NaN.
  const goalValue = String(document.getElementById('gpa-goal-input')?.value ?? '').trim();
  const goalGPA = goalValue === '' ? 3.85 : Number(goalValue);
  const goalEl  = document.getElementById('gpa-goal-result');
  const maxEl   = document.getElementById('gpa-max-possible');

  if(!Number.isFinite(goalGPA) || goalGPA < 0 || goalGPA > 4){
    if(maxEl)maxEl.textContent='';
    if(goalEl)goalEl.innerHTML='<div class="gpa-goal-summary">Enter a target GPA between 0.00 and 4.00.</div>';
    return;
  }
  if(goalTotalCr<=0){
    if(maxEl) maxEl.textContent = '';
    if(goalEl) goalEl.innerHTML = `<div class="gpa-goal-summary">Enter your transcript values above to use the goal calculator.</div>`;
    return;
  }

  // The best each course can do is the top grade on its own scale (a syllabus
  // scale may stop at A, not A+). The shown maximum is rounded DOWN, so typing it
  // back in as a goal is always reachable; rounding up made the max itself "not reachable".
  const topPts = c => Math.max(...scaleFor(c).map(g=>g.pts));
  const maxRaw = (hp + eligible.reduce((s,c)=>s+topPts(c)*gpaCredits(c),0))/goalTotalCr;
  const maxPossible = Math.min(Math.floor(maxRaw*100+1e-9)/100, 4.00);

  // Update max possible display
  if(maxEl) maxEl.textContent = `Maximum possible GPA this semester: ${maxPossible.toFixed(2)}`;

  if(!eligible.length){
    if(goalEl)goalEl.innerHTML='<div class="gpa-goal-summary">'+(currentGPA>=goalGPA?'Your current GPA already meets this goal.':'Add a GPA-bearing course to calculate the grades needed for this goal.')+'</div>';
    return;
  }
  if(goalEl){
    const totalHPNeeded = goalGPA * goalTotalCr;

    if(goalGPA > maxPossible + 1e-9){
      goalEl.innerHTML=`<div class="gpa-goal-summary">A ${goalGPA.toFixed(2)} GPA is not reachable this term — even with the top grade in every class the max is <strong style="color:var(--accent)">${maxPossible.toFixed(2)}</strong>.</div>`;
    } else {
      // Points per credit each course needs. Spread the term's needed points evenly, but a
      // course whose scale tops out below that even share is held at its best grade and
      // the rest of the need moves to the other courses, so a reachable goal never shows
      // a course as unattainable.
      let left = totalHPNeeded - hp, open = eligible.filter(c=>gpaCredits(c)>0);
      const need = new Map();
      for(let changed=true; changed && open.length;){
        changed = false;
        const avg = left / open.reduce((s,c)=>s+gpaCredits(c),0);
        for(const c of open) if(topPts(c) < avg - 1e-9){ need.set(c, topPts(c)); left -= topPts(c)*gpaCredits(c); changed = true; }
        open = open.filter(c=>!need.has(c));
      }
      const avgOpen = open.length ? left / open.reduce((s,c)=>s+gpaCredits(c),0) : 0;
      // Never ask for more than the course's top grade (guards float noise at the exact max).
      const needFor = c => Math.min(need.has(c) ? need.get(c) : avgOpen, topPts(c));

      const rows = eligible.map(c=>{
        const b = goalBadge(needFor(c), c.grade, scaleFor(c), courseGpaPoints(c));
        return `<div class="gpa-goal-crs-row">
          <div class="gpa-goal-crs-dot" style="background:${c.color}"></div>
          <div class="gpa-goal-crs-name">${esc(c.name)}</div>
          <span class="gpa-need-badge ${b.cls}">${b.text}</span>
        </div>`;
      }).join('');
      goalEl.innerHTML=rows+`<div class="gpa-goal-summary">To reach <strong style="color:var(--accent)">${goalGPA.toFixed(2)}</strong>, you need the grades above across ${goalTotalCr.toFixed(2)} total credits.</div>`;
    }
  }
}






// ─── RENDER ALL ───
function updateAsgnNotifDots(){
  const container = document.getElementById('asgn-notif-dots');
  if(!container) return;
  // Show a dot for every course that has at least one pending assignment
  const pending = state.courses.filter(c =>
    state.assignments.some(a => a.courseId === c.id && !a.done)
  );
  container.innerHTML = pending.map(c =>
    `<span class="tab-notif-dot" style="background:${c.color}"></span>`
  ).join('');
}

function updateGradeNotifDots(){
  const container = document.getElementById('grade-notif-dots');
  if(!container) return;
  const changed = state.courses.filter(c => c.gradeChanged);
  container.innerHTML = changed.map(c =>
    `<span class="tab-notif-dot" style="background:${c.color}"></span>`
  ).join('');
}

function renderAll(){renderHero();renderAssignments();renderGrades();updateAsgnNotifDots();updateGradeNotifDots();}

// ══════════════════════════════════════════════════
// INIT — runs after DOM is ready
// JS is in a separate file so Chrome MV3 CSP allows it
// ══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {

  // Apply initial state
  applyMode(state.mode);
  applyTheme(state.theme);
  setAccent(state.accentColor);
  buildThemeSwatches();
  syncWeekDayButtons();
  var treeSpeciesSelectInit = document.getElementById('tree-species-select');
  if (treeSpeciesSelectInit) treeSpeciesSelectInit.value = state.treeSpecies;
  renderAll();
  recalcAll();

  // Restore the saved custom swatches + theme color from extension storage
  // (async; overrides the default accent a few ms after first paint).
  restoreCustomColors();
  try{
    chrome.storage.local.get(['cc2_accent'], function(v){
      if(v && v.cc2_accent && v.cc2_accent!==state.accentColor){
        setAccent(v.cc2_accent);
        renderAll();
      }
      buildThemeSwatches();
    });
  }catch(e){}
  try{
    chrome.storage.local.get(['cc2_theme'], function(v){
      const theme=normalizeVisualTheme(v&&v.cc2_theme);
      if(v&&theme!==v.cc2_theme&&isVisualTheme(theme))saveTheme(theme);
      if(!previewVisualTheme()&&isVisualTheme(theme)&&theme!==state.theme){
        state.theme=theme;
        applyTheme(state.theme);
        drawRings();
        drawBars();
        renderGrades();
      }
    });
  }catch(e){}
  try{
    chrome.storage.local.get(['cc2_tree_species'], function(v){
      if(v && isTreeSpecies(v.cc2_tree_species) && v.cc2_tree_species!==state.treeSpecies){
        state.treeSpecies=v.cc2_tree_species;
        var sel=document.getElementById('tree-species-select');
        if(sel) sel.value=state.treeSpecies;
        if(state.theme==='nature') drawBars();
      }
    });
  }catch(e){}

  const scrollBody=document.getElementById('body');
  let techScrollFrame=false;
  if(scrollBody) scrollBody.addEventListener('scroll',()=>{
    if(state.theme!=='tech' || techScrollFrame) return;
    techScrollFrame=true;
    requestAnimationFrame(()=>{techScrollFrame=false;syncTechScrollGradient();});
  },{passive:true});

  // ── Tab buttons ────────────────────────────────
  const tabButtons=Array.from(document.querySelectorAll('.tab-btn'));
  document.getElementById('tabs')?.setAttribute('role','tablist');
  document.getElementById('tabs')?.setAttribute('aria-label','Canvas tools');
  tabButtons.forEach(function(btn,index) {
    const panel=document.getElementById('panel-'+btn.dataset.tab);
    if(!btn.id)btn.id='tab-'+btn.dataset.tab;
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-controls','panel-'+btn.dataset.tab);
    btn.setAttribute('aria-selected',String(state.activeTab===btn.dataset.tab));
    btn.tabIndex=state.activeTab===btn.dataset.tab||(!state.activeTab&&index===0)?0:-1;
    if(panel){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',btn.id);}
    btn.addEventListener('click', function() {
      var tab = btn.dataset.tab;
      setPanelFocus(true);
      tabButtons.forEach(function(b) {
        const active=b===btn;
        b.classList.toggle('active',active);
        b.setAttribute('aria-selected',String(active));
        b.tabIndex=active?0:-1;
      });
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      state.activeTab = tab;
      var panel = document.getElementById('panel-' + tab);
      if (panel) panel.classList.add('active');
      if (tab === 'assignments') { state.courses.forEach(function(c){c.newAssignment=false;}); renderAssignments(); updateAsgnNotifDots(); }
      if (tab === 'grades')      { state.courses.forEach(function(c){c.gradeChanged=false;}); var dn=document.getElementById('grade-notif-dots'); if(dn) dn.innerHTML=''; renderGrades(); }
      if (tab === 'gpa')         recalcAll();
    });
    btn.addEventListener('keydown',function(event){
      let next;
      if(event.key==='ArrowRight')next=(index+1)%tabButtons.length;
      else if(event.key==='ArrowLeft')next=(index+tabButtons.length-1)%tabButtons.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabButtons.length-1;
      else return;
      event.preventDefault();tabButtons[next].click();tabButtons[next].focus();
    });
  });

  const overviewReturn=document.getElementById('overview-return');
  if(overviewReturn) overviewReturn.addEventListener('click',()=>setPanelFocus(false));

  // ── Sort dropdown ───────────────────────────────
  var sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.addEventListener('change', function() { setSort(sortSelect.value); });

  // ── Tree species dropdown (Nature theme, tree bar chart only) ──
  var treeSpeciesSelect = document.getElementById('tree-species-select');
  if (treeSpeciesSelect) treeSpeciesSelect.addEventListener('change', function() { setTreeSpecies(treeSpeciesSelect.value); });

  // ── Chart cycle button ──────────────────────────
  document.getElementById('chart-show-btn')?.addEventListener('click',()=>selectChartView(state.chartStyle));
  const chartChoices=Array.from(document.querySelectorAll('[data-chart-view]'));
  chartChoices.forEach((button,index)=>{
    button.addEventListener('click',()=>selectChartView(button.dataset.chartView));
    button.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%chartChoices.length;
      else if(event.key==='ArrowLeft')next=(index+chartChoices.length-1)%chartChoices.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=chartChoices.length-1;
      else return;
      event.preventDefault();
      selectChartView(chartChoices[next].dataset.chartView);
      if(state.chartVisible)chartChoices[next].focus({preventScroll:true});
      else document.getElementById('chart-show-btn')?.focus({preventScroll:true});
    });
  });

  // ── Theme, mode, and week-start buttons ────────
  var themeBtn = document.getElementById('theme-icon-btn');
  var modeBtn  = document.getElementById('mode-btn');
  var weekBtn  = document.getElementById('week-icon-btn');
  var styleBtn = document.getElementById('style-icon-btn');
  if (themeBtn) themeBtn.addEventListener('click', function() { toggleThemePopup(); });
  if (modeBtn)  modeBtn.addEventListener('click',  function() { toggleMode();       });
  if (weekBtn)  weekBtn.addEventListener('click',  function() { toggleWeekPopup();  });
  if (styleBtn) styleBtn.addEventListener('click', function() { toggleStylePopup(); });

  // ── Visual theme option buttons ─────────────────
  document.querySelectorAll('.style-opt-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ setTheme(btn.dataset.style); });
  });
  syncStyleButtons();

  // ── Color picker apply button ──────────────────
  var applyBtn = document.getElementById('th-hex-apply');
  if (applyBtn) applyBtn.addEventListener('click', function() { applyCustomColor(); });

  // ── GPA inputs ────────────────────────────────
  ['gpa-honor-pts','gpa-graded-units','gpa-goal-input'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() { saveGpaInputs(); recalcAll(); });
  });

  // Restore previously entered transcript/goal values, then recompute
  restoreGpaInputs(function() { recalcAll(); });

  // ── Click delegation for dynamic content ───────
  document.addEventListener('keydown',function(event){
    if(event.key!=='Escape')return;
    let trigger=null,closed=false;
    [['theme-popup','theme-icon-btn'],['week-popup','week-icon-btn'],['style-popup','style-icon-btn']].forEach(([popupId,buttonId])=>{
      const popup=document.getElementById(popupId);
      if(popup?.classList.contains('open')){
        closed=true;trigger=document.getElementById(buttonId);
        setControlPopupOpen(popupId,buttonId,false);
      }
    });
    if(state.gradeMenuCourseId){
      closed=true;
      trigger=Array.from(document.querySelectorAll('[data-grade-menu]')).find(button=>button.dataset.gradeMenu===state.gradeMenuCourseId)||trigger;
      state.gradeMenuCourseId=null;
      document.querySelectorAll('.grade-card-menu.open').forEach(menu=>menu.classList.remove('open'));
      document.querySelectorAll('[data-grade-menu]').forEach(button=>button.setAttribute('aria-expanded','false'));
    }
    const contextMenu=document.getElementById('th-ctx-menu');
    if(contextMenu&&contextMenu.style.display==='block'){closed=true;contextMenu.style.display='none';}
    if(closed){event.preventDefault();event.stopPropagation();trigger?.focus();}
  });
  document.addEventListener('click', function(e) {
    // Assignment done-toggle circle — on a pending item the rest of the row
    // is a real link (target="_top") to Canvas, handled natively. On a done
    // item (Completed section) there's no link at all (asgnHTML renders a
    // plain div there instead of <a>), so the whole row un-completes it.
    // Dedicated per-course grade trend and its overflow-menu entry.
    var trendBack = e.target.closest('[data-grade-trend-back]');
    if (trendBack) { closeGradeTrend(); return; }
    var trendOpen = e.target.closest('[data-grade-trend]');
    if (trendOpen) { openGradeTrend(trendOpen.dataset.gradeTrend); return; }
    var gradeMenu = e.target.closest('[data-grade-menu]');
    if (gradeMenu) { toggleGradeMenu(gradeMenu.dataset.gradeMenu); return; }
    if (state.gradeMenuCourseId && !e.target.closest('.grade-card-menu-wrap')) {
      state.gradeMenuCourseId = null;
      document.querySelectorAll('.grade-card-menu.open').forEach(function(menu){ menu.classList.remove('open'); });
      document.querySelectorAll('[data-grade-menu]').forEach(function(button){ button.setAttribute('aria-expanded','false'); });
    }

    var check = e.target.closest('.asgn-check');
    var asgnRow = e.target.closest('.asgn-item');
    if (check || (asgnRow && asgnRow.classList.contains('done'))) {
      if (asgnRow && asgnRow.dataset.id) toggleAsgn(e, asgnRow.dataset.id);
      return;
    }

    // Grade breakdown toggle
    var bdt = e.target.closest('[data-bdtoggle]');
    if (bdt) {
      var bdc = state.courses.find(function(x){ return x.id===bdt.dataset.bdtoggle; });
      if (bdc) {
        const restoreFocus=document.activeElement===bdt;
        bdc.breakdownOpen = !bdc.breakdownOpen; renderGrades();
        if(restoreFocus)Array.from(document.querySelectorAll('[data-bdtoggle]')).find(button=>button.dataset.bdtoggle===bdc.id)?.focus();
      }
      return;
    }

    // Syllabus toggle
    var syl = e.target.closest('[data-syllabus]');
    if (syl) { toggleSyllabus(syl.dataset.syllabus); return; }

    // Clear rubric
    var clr = e.target.closest('[data-clearrubric]');
    if (clr) { clearRubric(clr.dataset.clearrubric); return; }

    // Re-analyze syllabus
    var rean = e.target.closest('[data-reanalyze]');
    if (rean) { reanalyzeSyllabus(rean.dataset.reanalyze); return; }

    // Week start day picker
    var wd = e.target.closest('[data-weekday]');
    if (wd) { setWeekStart(parseInt(wd.dataset.weekday, 10)); return; }

    // Close theme popup
    var tw = document.getElementById('theme-wrap');
    if (tw && !tw.contains(e.target)) {
      setControlPopupOpen('theme-popup','theme-icon-btn',false);
    }

    // Close week popup
    var wwrap = document.getElementById('week-wrap');
    if (wwrap && !wwrap.contains(e.target)) {
      setControlPopupOpen('week-popup','week-icon-btn',false);
    }

    // Close style (visual theme) popup
    var swrap = document.getElementById('style-wrap');
    if (swrap && !swrap.contains(e.target)) {
      setStylePopupOpen(false);
    }

    // Dismiss context menu
    var cm = document.getElementById('th-ctx-menu');
    if (cm && !cm.contains(e.target)) cm.style.display = 'none';
  });

  // ── Credit hours delegation ────────────────────
  document.addEventListener('change', function(e) {
    var cr = e.target.closest('[data-creditcourse]');
    if (cr) {
      var cid = cr.dataset.creditcourse;
      var course = state.courses.find(function(c){ return c.id===cid; });
      if (course) {
        course.credits = Math.min(9, Math.max(0.5, parseFloat(cr.value) || 3));
        saveCredits();
        recalcAll();
      }
    }
  });

});

// ── Live "score needed" target input (Grades tab breakdown) ───
// Updates only the result span so the input keeps focus while typing.
document.addEventListener('input', function(e) {
  var bt = e.target.closest('[data-bdtarget]');
  if (!bt) return;
  var c = state.courses.find(function(x){ return x.id===bt.dataset.bdtarget; });
  if (!c) return;
  c.bdTarget = bt.value;
  var span = document.getElementById('bd-need-' + c.id);
  if (span) span.textContent = needText(computeNeeded(c, bt.value), c.breakdown);
});

document.getElementById('next-deadlines')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-course-id]');
  if(!button)return;
  document.getElementById('tab-assignments').click();
  setSort('course');
  const row=[...document.querySelectorAll('.course-group-header')].find(el=>el.dataset.courseId===button.dataset.courseId);
  const scroller=document.getElementById('body');
  if(row&&scroller){
    // Scroll the assignment pane directly; scrollIntoView also moves the host page.
    const top=scroller.scrollTop+row.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientTop;
    scroller.scrollTo({top,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    row.focus({preventScroll:true});
  }
});

// Node-only export for the test suite (test/grade-math.test.js). `module`
// doesn't exist in the browser, so this is a no-op when loaded via <script>.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GPA_SCALE_DEFAULT, state, isGold, tagText, textColor, esc,
    scaleFor, pctToLetter, pctToPts, getDays, fmtDue, getWeekRange,
    defaultTarget, computeNeeded, needText, capGPA, goalBadge,
    parseGpaNumber, saveCustomColors, restoreCustomColors, getCustomColors,
    isVisualTheme, isTreeSpecies, isNatureMaterial, normalizeNatureMaterial, loadTheme, saveTheme,
    loadTreeSpecies, saveTreeSpecies,
    ORBIT_PLANETS, orbitPlanetArt, natureMix, natureShade, natureSpecies, natureRingPitch, natureRingMaterial,
    natureMaterialMedallionSVG, saveNatureMaterials, updateNatureMaterial,
    formatGradeTrendDate, gradeTrendColor, filterGradeTrendPoints, gradeTrendViewHTML,
  };
}
