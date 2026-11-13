// Draw the sketches once, then let their small hover/focus reactions take over.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const sketches = document.querySelectorAll('.curiosity-sketch');
const entranceAnimations = [];
const entranceStart = document.timeline.currentTime;
const drawDuration = 2100;
// Leave a one-second breath after the highlight finishes.
const landingDelay = 2390;

sketches.forEach((sketch, index) => {
  if (motionPreference.matches || !Element.prototype.animate) {
    sketch.classList.add('is-settled');
    return;
  }
  const animations = [];
  const delay = landingDelay + index * 1150;
  // Hide the whole sketch (including round stroke caps and its caption) until its turn.
  const reveal = sketch.animate([
    { opacity: 0 },
    { opacity: 1, offset: .001 },
    { opacity: 1 }
  ], { duration: drawDuration, delay, fill: 'backwards' });
  reveal.startTime = entranceStart;
  entranceAnimations.push(reveal);
  animations.push(reveal.finished.catch(() => {}));
  const strokes = Array.from(sketch.querySelectorAll('svg path, svg circle, svg ellipse'))
    .map(shape => ({ shape, length: shape.getTotalLength() }))
    .filter(stroke => stroke.length > 0);
  const weight = strokes.reduce((sum, stroke) => sum + Math.sqrt(stroke.length) + 5, 0);
  let strokeStart = 0;
  strokes.forEach(({ shape, length }) => {
    const strokeDuration = 1850 * (Math.sqrt(length) + 5) / weight;
    const style = getComputedStyle(shape);
    const animation = shape.animate([
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: length, fillOpacity: 0 },
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: length*.66, fillOpacity: 0, offset: .24 },
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: length*.43, fillOpacity: 0, offset: .46 },
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: length*.4, fillOpacity: 0, offset: .55 },
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0, fillOpacity: 0, offset: .8 },
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0, fillOpacity: style.fillOpacity }
    ], { duration: strokeDuration, delay: delay + strokeStart, easing: 'linear', fill: 'backwards' });
    animation.startTime = entranceStart;
    strokeStart += strokeDuration;
    animations.push(animation.finished.catch(() => {}));
    entranceAnimations.push(animation);
  });
  Promise.all(animations).then(() => sketch.classList.add('is-settled'));
});

motionPreference.addEventListener('change', event => {
  if (!event.matches) return;
  entranceAnimations.forEach(animation => animation.cancel());
  sketches.forEach(sketch => sketch.classList.add('is-settled'));
});

// The guide waits for the actual animation completion, including reduced motion.
Promise.all(entranceAnimations.map(animation => animation.finished.catch(() => {}))).then(() => {
  const intro = document.querySelector('.curiosity-intro');
  if (!intro) return;
  intro.dataset.entranceComplete = 'true';
  intro.dispatchEvent(new Event('curiosity:entrance-complete'));
});
