import { solveLimb } from './paper-pose.js?fall=1';

/* His cape: a triangle the visitor draws for him becomes a bright red pencil cape. He
   flies one lap of the screen in it, superhero style, then lands and lets it fade away.
   Pure drawing and geometry; paper-guide.js runs the sequence. */
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const unit = v => { const n = Math.hypot(v.x, v.y) || 1; return { x: v.x / n, y: v.y / n }; };

// Flat out along his heading: both arms straight out in front, both legs straight out
// behind. Built facing right, then mirrored and tipped by `pitch`.
export function heroPose(at, facing, pitch, time) {
  const c = { x: at.x, y: at.y - 12 }, cos = Math.cos(pitch), sin = Math.sin(pitch);
  const place = p => ({ x: c.x + cos * facing * p.x - sin * p.y, y: c.y + sin * facing * p.x + cos * p.y });
  const limb = l => ({ root: place(l.root), joint: place(l.joint), end: place(l.end) });
  const hip = { x: -6, y: .5 }, shoulder = { x: 6, y: -.5 }, kick = Math.sin(time * 9) * .6;
  // Every limb reaches its full length, so elbows and knees stay straight. His chin is up
  // and the arms run just under it, never through his head.
  const arms = [solveLimb(shoulder, { x: 20.3, y: 4.6 }, 7.5, 7.5, { x: 0, y: 1 }),
    solveLimb(shoulder, { x: 20.6, y: 3 }, 7.5, 7.5, { x: 0, y: 1 })];
  const legs = [solveLimb(hip, { x: -23.9, y: 1.5 + kick }, 9, 9, { x: 0, y: 1 }),
    solveLimb(hip, { x: -23.9, y: -.6 - kick }, 9, 9, { x: 0, y: 1 })];
  return { hip: place(hip), shoulder: place(shoulder), head: place({ x: 10, y: -5.2 }),
    arms: arms.map(limb), legs: legs.map(limb), crawl: 0 };
}

// Centripetal Catmull-Rom between p1 and p2: no loops or kinks where the points bunch up.
function spline(p0, p1, p2, p3, t) {
  const gap = (a, b) => Math.max(1e-4, Math.hypot(b.x - a.x, b.y - a.y) ** .5);
  const t1 = gap(p0, p1), t2 = t1 + gap(p1, p2), t3 = t2 + gap(p2, p3), u = mix(t1, t2, t);
  const lerp = (a, b, ta, tb) => { const k = (u - ta) / (tb - ta); return { x: mix(a.x, b.x, k), y: mix(a.y, b.y, k) }; };
  const a1 = lerp(p0, p1, 0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  return lerp(lerp(a1, a2, 0, t2), lerp(a2, a3, t1, t3), t1, t2);
}

// Nearly two laps of the visible page: up off the spot he stands on, round an oval that
// fills the screen (starting the way that climbs), and down onto `to`. `at(u)` walks it by
// distance, 0..1, and gives the heading there.
export function heroRoute(from, to, view, facing) {
  const cx = view.left + view.width / 2, cy = view.top + view.height * .48;
  const rx = Math.max(90, view.width * .34), ry = Math.max(70, view.height * .28);
  const lift = { x: from.x + facing * 14, y: from.y - 70 };
  const a0 = Math.atan2((lift.y - cy) / ry, (lift.x - cx) / rx);
  const turn = Math.abs(Math.cos(a0)) > .2 ? -Math.sign(Math.cos(a0)) : -facing * Math.sign(Math.sin(a0) || 1);
  const points = [from, lift];
  for (let k = 1; k <= 15; k++) { const a = a0 + turn * k * Math.PI / 4; points.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
  points.push({ x: to.x, y: to.y - 80 }, to);
  const ghost = (a, b) => ({ x: 2 * a.x - b.x, y: 2 * a.y - b.y });
  const all = [ghost(points[0], points[1]), ...points, ghost(points.at(-1), points.at(-2))];
  const line = [];
  for (let i = 1; i < all.length - 2; i++) for (let k = 0; k < 16; k++) line.push(spline(all[i - 1], all[i], all[i + 1], all[i + 2], k / 16));
  line.push({ ...to });
  const along = [0];
  for (let i = 1; i < line.length; i++) along.push(along[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const length = along.at(-1);
  return {
    length,
    at(u) {
      const s = Math.max(0, Math.min(1, u)) * length;
      let lo = 0, hi = line.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (along[m] <= s) lo = m; else hi = m; }
      const a = line[lo], b = line[hi], k = (s - along[lo]) / (along[hi] - along[lo] || 1), d = unit({ x: b.x - a.x, y: b.y - a.y });
      return { x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), dx: d.x, dy: d.y };
    }
  };
}

// Pencil speed lines trailing just past his feet and the tail of the cape.
export function drawWhoosh(ctx, at, heading, strength) {
  if (strength <= .05) return;
  const d = unit({ x: heading.dx, y: heading.dy }), n = { x: -d.y, y: d.x };
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#6a685c'; ctx.lineWidth = .9;
  [[-9, 28, 11], [0, 33, 15], [9, 26, 9]].forEach(([off, back, length], i) => {
    const x = at.x - d.x * back + n.x * off, y = at.y - 12 - d.y * back + n.y * off;
    ctx.globalAlpha = strength * (.6 - i * .12);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d.x * length, y - d.y * length); ctx.stroke();
  });
  ctx.restore();
}

// Tied at his neck and running down his back from the shoulder past the hip, so it trails
// whichever way his body points. Standing (hands on hips, seen from the front) it flares
// out behind both sides of him; in flight (`stream`, seen side on) it streams back off
// his shoulders, longer and rippling hard. `grow` sketches it in; `fade` fades it
// away while it stays tied at his neck.
export function drawCape(ctx, pose, { facing, clock, grow = 1, stream = 0, fade = 0 }) {
  const g = smooth(Math.max(0, Math.min(1, grow)));
  if (g <= 0 || fade >= 1) return;
  const neck = pose.shoulder, d = unit({ x: pose.hip.x - neck.x, y: pose.hip.y - neck.y });
  const n = { x: -facing * d.y, y: facing * d.x }; // away from his chest
  const length = mix(22, 25, stream) * g;
  const beat = clock * mix(3.2, 15, stream), flap = mix(.7, 2.4, stream);
  // A wave running from the neck to the hem: still at the knot, loosest at the tail.
  const at = (a, c) => {
    c += Math.sin(beat - a * .32) * flap * a / Math.max(1, length);
    return { x: neck.x + d.x * a + n.x * c, y: neck.y + d.y * a + n.y * c };
  };
  // Its two edges, k of the way down: either side of the spine when hanging, the spine
  // and a billow above it when streaming.
  const edges = k => {
    const flare = mix(2.4, 9, k) * g;
    return [mix(-flare, 1 + .5 * k, stream), mix(flare, mix(2.6, 7 * g, k) + Math.sin(k * Math.PI) * 1.2, stream)];
  };
  const [hemIn, hemOut] = edges(1), outline = [];
  for (let i = 0; i <= 8; i++) outline.push(at(length * i / 8, edges(i / 8)[0]));
  // A scalloped hem: rounded when hanging, its loose corner trailing furthest in flight.
  for (let i = 1; i <= 8; i++) {
    const k = i / 8, drop = mix(Math.sin(k * Math.PI) * 1.2, k * 3, stream) + Math.sin(k * Math.PI * 3) * .9 * g;
    outline.push(at(length + drop, mix(hemIn, hemOut, k)));
  }
  for (let i = 1; i < 8; i++) outline.push(at(length * (1 - i / 8), edges(1 - i / 8)[1]));
  const cloth = new Path2D();
  outline.forEach((p, i) => i ? cloth.lineTo(p.x, p.y) : cloth.moveTo(p.x, p.y));
  cloth.closePath();
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha *= (1 - fade) * Math.min(1, g * 1.6);
  ctx.fillStyle = '#e5232a'; ctx.fill(cloth);
  // Pencil hatching in a deeper red, kept inside the cloth.
  ctx.save(); ctx.clip(cloth);
  const hatch = new Path2D();
  for (let a = -2; a < length + 6; a += 3.2) { const p = at(a, -12), q = at(a + 6, 12); hatch.moveTo(p.x, p.y); hatch.lineTo(q.x, q.y); }
  ctx.strokeStyle = '#b3121b'; ctx.lineWidth = .6; ctx.globalAlpha *= .5; ctx.stroke(hatch);
  ctx.restore();
  // Outline traced twice, like the rest of his gear, and a knot at the neck.
  ctx.strokeStyle = '#9e0f17'; ctx.lineWidth = 1.05; ctx.stroke(cloth);
  const knot = at(.5, mix(0, 1.6, stream));
  ctx.beginPath(); ctx.arc(knot.x, knot.y, 1.3, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(.55, -.35); ctx.globalAlpha *= .35; ctx.lineWidth = .55; ctx.stroke(cloth);
  ctx.restore();
}
