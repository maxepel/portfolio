import { figurePose, jetpackPose, solveLimb } from './paper-pose.js?fall=3';
import { polylineCourse } from './paper-tour.js';
import { drawFlightGear, createJetSmoke } from './paper-flight.js?v=6';

const clamp = t => Math.max(0, Math.min(1, t));
const ease = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a + (b - a) * t;
const between = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
const SCALE = 1.35, FLIGHT = 2.1;

function mapPose(pose, point) {
  const limb = part => ({ root: point(part.root), joint: point(part.joint), end: point(part.end) });
  return { ...pose, hip: point(pose.hip), shoulder: point(pose.shoulder), head: point(pose.head), arms: pose.arms.map(limb), legs: pose.legs.map(limb) };
}

// Blend poses through the takeoff and landing without stretching his limbs.
function blendPose(a, b, t) {
  const limb = (first, second, bone) => {
    const root = between(first.root, second.root, t), joint = between(first.joint, second.joint, t);
    return solveLimb(root, between(first.end, second.end, t), bone, bone, { x: joint.x - root.x, y: joint.y - root.y });
  };
  return {
    hip: between(a.hip, b.hip, t), shoulder: between(a.shoulder, b.shoulder, t), head: between(a.head, b.head, t),
    arms: a.arms.map((arm, i) => limb(arm, b.arms[i], 7.5)), legs: a.legs.map((leg, i) => limb(leg, b.legs[i], 9))
  };
}

// Fly to the real toolbar with the same pencil jetpack used while free roaming.
// The figure and equipment share one interpolated render sample.
export function createToolShow({ from, reduced, ready, wake = () => {} }) {
  const tools = document.querySelector('.paper-tools');
  const tray = tools.querySelector('.paper-tray');
  const canvas = document.createElement('canvas');
  canvas.className = 'paper-tool-stage'; canvas.setAttribute('aria-hidden', 'true');
  const shade = document.createElement('div');
  shade.className = 'paper-tool-shade'; shade.setAttribute('aria-hidden', 'true');
  document.body.append(shade, canvas);
  const ctx = canvas.getContext('2d');
  let stage = reduced.matches ? 'ascend' : 'jetpack', time = 0, phase = 0;
  let foot = { x: from.x, y: from.y - scrollY }, origin = { ...foot };
  let target = null, onStop = null, previous = null, rendered = null, aim = null, scale = 1;
  let bounds, top, bottom, offset = 0, writtenOffset = NaN;
  let ratio = 1;
  const smoke = createJetSmoke();
  const standing = figurePose(polylineCourse([{ x: -35, y: 0 }, { x: 35, y: 0 }]), .5, 0, 0, 1, 0);
  tools.classList.add('is-touring');
  document.body.classList.add('paper-tools-tour');

  function setPull(value) {
    if (value === writtenOffset) return;
    tools.style.setProperty('--tour-pull', `${value.toFixed(3)}px`); writtenOffset = value;
  }
  function measure() {
    const h = tray.offsetHeight;
    tools.style.setProperty('--tour-top', `${Math.round(Math.max(68, (innerHeight - h) / 2))}px`);
    setPull(0);
    bounds = tray.getBoundingClientRect();
    top = bounds.top; bottom = bounds.bottom;
    ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * ratio); canvas.height = Math.round(innerHeight * ratio);
    canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
    if (target) target = stopFor(target.key);
  }
  function stopFor(key) {
    const r = tray.querySelector(`[data-paper-tool="${key}"], [data-paper-action="${key}"]`).getBoundingClientRect();
    return { key, x: bounds.left + bounds.width / 2, y: top, point: { x: r.left + 8, y: r.top + r.height / 2 } };
  }
  function enter(next) {
    stage = next; time = 0; previous = null; rendered = null; tools.dataset.toolShow = next;
    if (next === 'ascend') shade.classList.add('is-landed');
  }
  function moveTo(key, done) {
    target = stopFor(key); onStop = done; origin = { ...foot };
    foot = { x: target.x, y: target.y }; enter('stop'); const callback = onStop; onStop = null; callback?.();
    wake(1);
  }
  measure();
  tools.dataset.toolShow = stage;
  if (reduced.matches) { foot = { x: bounds.left + bounds.width / 2, y: top }; shade.classList.add('is-landed'); }

  function step(dt) {
    if (dt > 0) previous = { stage, time, phase, foot: { ...foot }, offset };
    time += dt; rendered = null;
    // The pointing hand sweeps from one tool to the next instead of jumping.
    if (target) aim = aim ? between(aim, target.point, 1 - Math.exp(-dt * 10)) : { ...target.point };
    smoke.step(dt, stage === 'jetpack' ? { x: foot.x - 2, y: foot.y + scrollY - 12 } : null);
    if (stage === 'jetpack') {
      const t = ease(time / FLIGHT);
      foot = between(origin, { x: bounds.left + bounds.width / 2, y: top }, t);
      foot.y -= Math.sin(t * Math.PI) * 45;
      if (time >= FLIGHT) {
        foot = { x: bounds.left + bounds.width / 2, y: top }; enter('ascend');
      }
    } else if (stage === 'ascend') {
      if (reduced.matches || time >= .3) {
        foot = { x: bounds.left + bounds.width / 2, y: top }; enter('stop'); ready();
      }
    } else if (stage === 'move' || stage === 'leave') {
      const destination = stage === 'leave' ? bottom - 5 : target.y, distance = destination - foot.y;
      foot.x = bounds.left;
      foot.y += Math.sign(distance) * Math.min(Math.abs(distance), dt * 100);
      phase += dt * 16;
      if (reduced.matches || Math.abs(distance) < 1) {
        foot.y = destination; enter('stop'); const done = onStop; onStop = null; done?.();
      }
    }
    return { x: foot.x, y: foot.y + scrollY };
  }

  function sample(alpha) {
    const t = clamp(alpha);
    return previous?.stage === stage ? {
      stage, time: mix(previous.time, time, t), phase: mix(previous.phase, phase, t),
      foot: between(previous.foot, foot, t), offset: mix(previous.offset, offset, t)
    } : { stage, time, phase, foot, offset };
  }
  function climbing(at, stride, moving) {
    return mapPose(standing, point => ({ x: point.x + at.x, y: point.y + at.y }));
  }
  function pose(alpha = 1) {
    const s = rendered = sample(alpha), at = s.foot;
    // He grows to tour size on the way up rather than all at once.
    const k = scale = s.stage === 'jetpack' ? mix(1, SCALE, ease(s.time / FLIGHT)) : SCALE;
    let p;
    if (s.stage === 'jetpack') {
      const t = clamp(s.time / FLIGHT), flying = jetpackPose(at, s.time, 1, t);
      p = t < .5 ? blendPose(climbing(at), flying, ease(t / .15))
        : blendPose(flying, climbing(at), ease((t - .82) / .18));
    } else {
      const gait = s.stage === 'stop' ? 0 : s.stage === 'ascend' ? ease(s.time / .18) : 1;
      p = climbing(at, s.phase, gait);
      if (s.stage === 'stop' && target) {
        const point = aim || target.point, reach = { x: at.x + (point.x - at.x) / k, y: at.y + (point.y - at.y) / k };
        p.arms[0] = solveLimb(p.shoulder, reach, 7.5, 7.5, { x: 0, y: 1 });
      }
    }
    return mapPose(p, point => ({ x: at.x + (point.x - at.x) * k, y: at.y + (point.y - at.y) * k + scrollY }));
  }

  function context(p) {
    const s = rendered || sample(1);
    setPull(s.offset);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, -scrollY * ratio);
    smoke.draw(ctx);
    if (s.stage === 'jetpack') drawFlightGear(ctx, p, 'jetpack', clamp(s.time / FLIGHT), s.time, 1);
    return ctx;
  }

  function resize() {
    measure(); previous = null; rendered = null;
    if (stage !== 'jetpack') foot = { x: bounds.left + bounds.width / 2, y: top };
    else {
      origin.x = Math.min(origin.x, innerWidth - 100); origin.y = Math.max(100, Math.min(innerHeight - 60, origin.y));
    }
    setPull(offset); wake(.2);
  }
  addEventListener('resize', resize);
  return {
    step, pose, context, moveTo,
    get moving() { return stage !== 'stop' || smoke.active || !!(aim && target && Math.hypot(aim.x - target.point.x, aim.y - target.point.y) > .5); },
    get scale() { return scale; },
    leave(done) { target = null; done(); wake(1); },
    destroy() {
      removeEventListener('resize', resize); canvas.remove();
      // The paper wash fades back off the page instead of vanishing in one frame.
      shade.classList.remove('is-landed'); setTimeout(() => shade.remove(), reduced.matches ? 0 : 350);
      tools.classList.remove('is-touring'); tools.style.removeProperty('--tour-top'); tools.style.removeProperty('--tour-pull');
      delete tools.dataset.toolShow; document.body.classList.remove('paper-tools-tour', 'paper-tools-practice');
    }
  };
}
