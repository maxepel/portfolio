// Align the handwriting baseline, rather than the top of its line box, to a rule.
// One full paper row per line keeps wrapped paragraphs and bullets on the grid.
const selector = '.page-closing h2, .page-closing p, .desc .title, .desc .tagline, .desc .lead, .desc .why, .project-note h3, .project-note p, .demo-context, .desc .features, .paper-intro-copy p, .paper-intro-copy a, .curiosity-sketch span, .paper-intro h1, .paper-playground-note, .paper-playground-caption, .chips dt, .brand-language, .month-tag, .footer a, .brand-marquee-group span, .nav-brand, .nav-links a, .dl-note, .tut-btn, .btn-download';
const logoSelector = '.chips .brand-logo img, .chips .brand-tech img, .brand-marquee-group img';
const baselines = new Map();
let pending = false;

function baselineOffset(css) {
  // Computed font shorthand can be empty when longhand settings differ.
  const key = `${css.fontFamily}|${css.fontSize}|${css.fontWeight}|${css.fontStyle}|${css.lineHeight}`;
  if (baselines.has(key)) return baselines.get(key);
  // Let the browser measure the loaded font's real baseline. A zero-height
  // inline block sits on that baseline, including the line box's half-leading.
  const sample = document.createElement('div');
  sample.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;';
  sample.style.fontFamily = css.fontFamily;
  sample.style.fontSize = css.fontSize;
  sample.style.fontWeight = css.fontWeight;
  sample.style.fontStyle = css.fontStyle;
  sample.style.lineHeight = css.lineHeight;
  const marker = document.createElement('span');
  marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
  sample.append(document.createTextNode('Ag'), marker);
  document.body.append(sample);
  const offset = marker.getBoundingClientRect().top - sample.getBoundingClientRect().top;
  sample.remove();
  baselines.set(key, offset);
  return offset;
}

function layoutTop(element) {
  let top = element.getBoundingClientRect().top + scrollY;
  // Reveal animations and previous ruling adjustments are visual offsets only.
  // Subtract them to retain fractional layout coordinates without feedback drift.
  for (let node = element; node; node = node.parentElement) {
    const css = getComputedStyle(node);
    if (css.transform !== 'none') top -= new DOMMatrixReadOnly(css.transform).m42;
    if (css.translate !== 'none') top -= parseFloat(css.translate.split(' ')[1]) || 0;
  }
  return top;
}

function align() {
  pending = false;
  if (!document.body.classList.contains('paper-play')) return;
  // Reduce the remaining credit gaps by half for Finder and another 20% for Canvas.
  // Share the rise with the section so its following divider moves with the credits.
  // Subtract the previous relative offset so repeated layout passes stay stable.
  for (const credits of document.querySelectorAll('.project > .chips')) {
    const project = credits.parentElement;
    const content = [...project.children].filter(node => node.matches('.desc, .demo'));
    if (!content.length) continue;
    const bottom = Math.max(...content.map(node => layoutTop(node) + node.offsetHeight));
    const originalTop = layoutTop(credits) - (parseFloat(getComputedStyle(credits).top) || 0);
    const reduction = project.id === 'content-finder' ? .625 : project.id === 'canvas-widget' ? .4 : .25;
    const gap = Math.max(0, originalTop - bottom);
    const extra = project.id === 'node-maps' ? 5 * (parseFloat(getComputedStyle(document.body).getPropertyValue('--paper-line-height')) || 32) : 0;
    const rise = `${-Math.min(Math.max(0, gap - 32), gap * reduction + extra)}px`;
    if (project.style.getPropertyValue('--credits-rise') !== rise) project.style.setProperty('--credits-rise', rise);
  }
  // Keep the same area for each logo, letting wide wordmarks breathe. Credit
  // rows stay together and can be scrolled on narrow screens.
  for (const logo of document.querySelectorAll(logoSelector)) {
    if (!logo.naturalWidth || !logo.naturalHeight) continue;
    const ratio = Math.min(2.4, Math.max(.8, Math.sqrt(logo.naturalWidth / logo.naturalHeight)));
    const width = `calc(var(--brand-logo-size) * ${ratio})`;
    const height = `calc(var(--brand-logo-size) / ${ratio})`;
    for (const target of [logo, logo.closest('.brand-logo, .brand-tech')].filter(Boolean)) {
      if (target.style.getPropertyValue('--logo-width') !== width) target.style.setProperty('--logo-width', width);
      if (target.style.getPropertyValue('--logo-height') !== height) target.style.setProperty('--logo-height', height);
    }
  }
  const css = getComputedStyle(document.body);
  const spacing = parseFloat(css.getPropertyValue('--paper-line-height')) || 32;
  // Expand Canvas credits into the available page width; clear the tool only
  // when the single logo row is too wide to sit beside its frame.
  const canvas = document.querySelector('#canvas-widget');
  if (canvas) {
    const credits = canvas.querySelector('.chips');
    const width = `${canvas.clientWidth}px`;
    if (credits.style.getPropertyValue('--project-width') !== width) credits.style.setProperty('--project-width', width);
    const features = canvas.querySelector('.features');
    const frame = canvas.querySelector('.frame');
    let gap = 4 * spacing;
    if (innerWidth > 960) {
      const row = credits.querySelector('dd');
      const frameBox = frame.getBoundingClientRect();
      const creditsLeft = credits.getBoundingClientRect().left;
      if (features && creditsLeft + row.scrollWidth > frameBox.left - 16) {
        gap = Math.max(gap, layoutTop(frame) + frame.offsetHeight - layoutTop(features) - features.offsetHeight - 1.5 * spacing);
      }
    }
    const value = `${gap}px`;
    if (credits.style.getPropertyValue('--canvas-credits-gap') !== value) credits.style.setProperty('--canvas-credits-gap', value);
  }
  // The blue stroke occupies the last pixel of each background tile.
  const origin = (parseFloat(css.getPropertyValue('--paper-line-origin')) || 14) - .5;
  // Rest every project logo on a blue rule.
  // Scrolling brand-marquee logos keep their own layout.
  for (const logo of document.querySelectorAll('.chips .brand-logo, .chips .brand-tech')) {
    const bottom = layoutTop(logo) + logo.getBoundingClientRect().height;
    const shift = `${origin + Math.round((bottom - origin) / spacing) * spacing - bottom}px`;
    if (logo.style.getPropertyValue('--logos-line-shift') !== shift) logo.style.setProperty('--logos-line-shift', shift);
  }
  const changes = [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => {
    const style = getComputedStyle(element);
    const baseline = layoutTop(element) + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + baselineOffset(style);
    // The sticky header carries its own paper rules as it moves with the viewport.
    const nav = element.closest('.nav');
    const localOrigin = origin + (nav ? nav.getBoundingClientRect().top + scrollY : 0);
    const shift = localOrigin + Math.round((baseline - localOrigin) / spacing) * spacing - baseline;
    return [element, `${shift}px`];
  });
  for (const [element, shift] of changes) {
    if (element.style.getPropertyValue('--paper-line-shift') !== shift) element.style.setProperty('--paper-line-shift', shift);
  }
  // Canvas and Questboard demos start on the blue rule just below their title, whatever the page above them measures.
  for (const [section, topSelector] of [['#canvas-widget', '.frame'], ['#node-maps', '.frame']]) {
    const root = document.querySelector(section);
    const title = root?.querySelector('.title'), demo = root?.querySelector(':scope > .demo'), top = demo?.querySelector(topSelector);
    if (!title || !top || !top.getClientRects().length) continue;
    const titleBottom = layoutTop(title) + (parseFloat(title.style.getPropertyValue('--paper-line-shift')) || 0) + title.offsetHeight;
    const rule = origin + Math.ceil((titleBottom - 8 - origin) / spacing) * spacing;
    const natural = layoutTop(top) + (parseFloat(top.style.getPropertyValue('--paper-line-shift')) || 0);
    const rise = `${Math.round((rule - natural) * 10) / 10}px`;
    if (demo.style.getPropertyValue('--demo-rise') !== rise) demo.style.setProperty('--demo-rise', rise);
  }
}
function schedule() { if (!pending) { pending = true; requestAnimationFrame(align); } }
document.fonts.ready.then(() => { baselines.clear(); schedule(); });
document.fonts.addEventListener('loadingdone', () => { baselines.clear(); schedule(); });
addEventListener('resize', schedule, { passive: true });
addEventListener('load', schedule, { once: true });
document.addEventListener('load', event => { if (event.target instanceof HTMLImageElement && event.target.matches(logoSelector)) schedule(); }, true);
const observer = new ResizeObserver(schedule);
observer.observe(document.body);
document.querySelectorAll('.desc, .paper-intro-copy, .paper-playground').forEach(element => observer.observe(element));
schedule();
