// Small shared helpers: easing, math, and a property tweener with delays.

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const randf = () => Math.random();
export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));   // inclusive
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function lerpAngle(a, b, t) {
  const d = ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
  return a + d * t;
}

export function moveToward(from, to, delta) {
  return Math.abs(to - from) <= delta ? to : from + Math.sign(to - from) * delta;
}

// Godot's ease(x, curve) for 0 < curve < 1 (ease out) and curve > 1 (ease in).
export function godotEase(x, curve) {
  x = clamp(x, 0, 1);
  if (curve > 0) return curve < 1 ? 1 - Math.pow(1 - x, 1 / curve) : Math.pow(x, curve);
  return x;
}

// Tween easings
export const linear = (t) => t;
export const sineInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const backOut = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const bounceOut = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

// Property tweener. `from` is read when a tween starts, so chaining with delays works.
export class Tweener {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }
  get active() { return this.list.length > 0; }
  to(obj, key, to, dur, ease = linear, delay = 0) {
    this.list.push({ obj, key, to, dur: Math.max(1e-4, dur), ease, delay, t: 0, from: null });
    return this;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      let adv = dt;
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) continue;
        adv = -tw.delay;              // carry the leftover into the tween itself
        tw.delay = 0;
      }
      if (tw.from === null) tw.from = tw.obj[tw.key];
      tw.t += adv;
      const k = clamp(tw.t / tw.dur, 0, 1);
      tw.obj[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(k);
      if (k >= 1) this.list.splice(i, 1);
    }
  }
}

// Delayed calls driven by game time.
export class Timers {
  constructor() { this.list = []; }
  after(sec, fn) { this.list.push({ t: sec, fn }); }
  update(dt) {
    const due = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t -= dt;
      if (e.t <= 0) { this.list.splice(i, 1); due.push(e); }
    }
    for (let i = due.length - 1; i >= 0; i--) due[i].fn();   // callbacks may add or clear timers
  }
  clear() { this.list.length = 0; }
}
