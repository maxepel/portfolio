// Pure geometry for the guide: what he can stand on, how far he can jump, and a
// route from where he is to where he wants to be. No DOM, so it can be tested.
// A "course" is an array of ropes ({nodes, length}); a position runs 0..ropes.length.

// How far the guide can jump, in CSS px. Up is much shorter than down.
export const JUMP = { across: 92, up: 52, down: 130 };

// Fresh ink must cross the space in front of his torso, rather than the floor
// or the paper behind him. Points here are in page pixels.
export function freshWallAhead(points, body, direction) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dy = b.y - a.y;
    if (Math.abs(dy) < .5 || Math.abs(dy) < Math.abs(b.x - a.x)) continue;
    const t0 = (body.y - 32 - a.y) / dy, t1 = (body.y - 4 - a.y) / dy;
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    if (lo > hi) continue;
    const x0 = (a.x + (b.x - a.x) * lo - body.x) * direction;
    const x1 = (a.x + (b.x - a.x) * hi - body.x) * direction;
    if (Math.max(x0, x1) >= 4 && Math.min(x0, x1) <= 32) return true;
  }
  return false;
}

export function canJump(from, to) {
  const dx = Math.abs(to.x - from.x), dy = to.y - from.y;
  const reach = dy < 0 ? JUMP.up : JUMP.down;
  return dx <= JUMP.across && Math.abs(dy) <= reach && (dx / JUMP.across) ** 2 + (dy / reach) ** 2 <= 1;
}

// A pencil stroke becomes a one-span course: smoothed, then resampled so nodes
// are evenly spaced (positions along it then track distance).
export function polylineCourse(points, spacing = 5) {
  const clean = [];
  for (const p of points) if (!clean.length || Math.hypot(p.x - clean.at(-1).x, p.y - clean.at(-1).y) > .5) clean.push({ x: p.x, y: p.y });
  if (clean.length < 2) return null;
  let line = clean;
  for (let pass = 0; pass < 2; pass++) {
    line = line.map((p, i) => {
      if (i === 0 || i === line.length - 1) return p;
      const lo = Math.max(0, i - 2), hi = Math.min(line.length - 1, i + 2);
      let x = 0, y = 0;
      for (let k = lo; k <= hi; k++) { x += line[k].x; y += line[k].y; }
      return { x: x / (hi - lo + 1), y: y / (hi - lo + 1) };
    });
  }
  const along = [0];
  for (let i = 1; i < line.length; i++) along.push(along[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const length = along.at(-1);
  if (length < 1) return null;
  const count = Math.max(2, Math.ceil(length / spacing)), nodes = [];
  let k = 0;
  for (let n = 0; n <= count; n++) {
    const s = length * n / count;
    while (k < line.length - 2 && along[k + 1] < s) k++;
    const span = along[k + 1] - along[k] || 1, t = Math.max(0, Math.min(1, (s - along[k]) / span));
    nodes.push({ x: line[k].x + (line[k + 1].x - line[k].x) * t, y: line[k].y + (line[k + 1].y - line[k].y) * t });
  }
  return [{ nodes, restLength: length, length, tension: 0 }];
}

export function courseLength(ropes) { return ropes.reduce((sum, r) => sum + r.length, 0); }

// Pixels along the course between two positions.
export function courseDistance(ropes, a, b) {
  const lo = Math.max(0, Math.min(a, b)), hi = Math.min(ropes.length, Math.max(a, b));
  let sum = 0;
  for (let span = Math.floor(lo); span < ropes.length && span < hi; span++) {
    sum += (Math.min(hi, span + 1) - Math.max(lo, span)) * ropes[span].length;
  }
  return sum;
}

export function courseEnds(ropes) {
  if (!ropes.length) return [];
  const a = ropes[0].nodes[0], b = ropes.at(-1).nodes.at(-1);
  return [{ pos: 0, x: a.x, y: a.y }, { pos: ropes.length, x: b.x, y: b.y }];
}

export function pointAt(ropes, pos) {
  const span = Math.min(ropes.length - 1, Math.max(0, Math.floor(pos)));
  const rope = ropes[span], last = (rope?.nodes.length ?? 0) - 1;
  // A string built while the page had no size yet has no usable nodes; it is rebuilt on
  // the first resize, so give its start (or the origin) rather than throwing.
  if (last < 1) return rope?.nodes[0] ? { x: rope.nodes[0].x, y: rope.nodes[0].y } : { x: 0, y: 0 };
  const at = Math.max(0, Math.min(1, pos - span)) * last, i = Math.min(last - 1, Math.floor(at)), t = at - i;
  const a = rope.nodes[i], b = rope.nodes[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function nearestOnCourse(ropes, p) {
  let best = null;
  ropes.forEach((rope, span) => {
    const last = rope.nodes.length - 1;
    for (let i = 0; i < last; i++) {
      const a = rope.nodes[i], b = rope.nodes[i + 1], dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
      const x = a.x + dx * t, y = a.y + dy * t, d = Math.hypot(p.x - x, p.y - y);
      if (!best || d < best.dist) best = { dist: d, x, y, pos: span + (i + t) / last };
    }
  });
  return best;
}

// For one ordered pair, the best way to jump from X onto Y: take off from an end of
// X (or from the point of X nearest an end of Y) and land on Y.
function link(X, Y) {
  let best = null;
  const offer = (from, to) => {
    if (canJump(from, to) && (!best || Math.hypot(to.x - from.x, to.y - from.y) < best.gap)) {
      best = { from: { pos: from.pos, x: from.x, y: from.y }, to: { pos: to.pos, x: to.x, y: to.y }, gap: Math.hypot(to.x - from.x, to.y - from.y) };
    }
  };
  for (const end of courseEnds(X.ropes)) { const n = nearestOnCourse(Y.ropes, end); if (n) offer(end, n); }
  for (const end of courseEnds(Y.ropes)) { const n = nearestOnCourse(X.ropes, end); if (n) offer(n, end); }
  return best;
}

// Breadth-first over surfaces, fewest jumps first.
// Returns {found, legs: [{from, to, takeoff: pos, land: pos}], reachable: Set of ids}.
export function planRoute(surfaces, startId, goalId) {
  const byId = new Map(surfaces.map(s => [s.id, s]));
  const via = new Map([[startId, null]]), queue = [startId];
  for (let head = 0; head < queue.length; head++) {
    const X = byId.get(queue[head]);
    for (const Y of surfaces) {
      if (via.has(Y.id)) continue;
      const hop = link(X, Y);
      if (hop) { via.set(Y.id, { from: X.id, hop }); queue.push(Y.id); }
    }
  }
  const legs = [];
  for (let id = goalId, step; via.get(id); id = step.from) {
    step = via.get(id);
    legs.unshift({ from: step.from, to: id, takeoff: step.hop.from.pos, land: step.hop.to.pos });
  }
  return { found: via.has(goalId), legs, reachable: new Set(via.keys()) };
}

// Where he gets stuck: among every reachable surface end, the one nearest the goal.
export function frontier(surfaces, reachable, goal) {
  let best = null;
  for (const s of surfaces) {
    if (!reachable.has(s.id)) continue;
    for (const end of courseEnds(s.ropes)) {
      const d = Math.hypot(end.x - goal.x, end.y - goal.y);
      if (!best || d < best.dist) best = { id: s.id, pos: end.pos, x: end.x, y: end.y, dist: d };
    }
  }
  return best;
}

// The guide's own pencil line for "Draw it for me". It leaves fairly level, swings toward
// the goal, and arrives from above (or below), with a slight hand tremor that fades out at
// both ends so the line starts and finishes exactly on the two points.
export function sketchPath(from, to, spacing = 4) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const c1 = { x: from.x + dx * .45, y: from.y + dy * .08 }, c2 = { x: to.x - dx * .08, y: to.y - dy * .45 };
  const nx = -dy / length, ny = dx / length, count = Math.max(8, Math.ceil(length * 1.2 / spacing)), points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    const wobble = (Math.sin(t * length / 23) * 1.4 + Math.sin(t * length / 9 + 1) * .5) * Math.sin(Math.PI * t);
    points.push({ x: a * from.x + b * c1.x + c * c2.x + d * to.x + nx * wobble, y: a * from.y + b * c1.y + c * c2.y + d * to.y + ny * wobble });
  }
  return points;
}

// Body position part-way through a jump: straight across, with a hump.
export function jumpPoint(from, to, t) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const height = 10 + Math.max(0, from.y - to.y) * .5 + dist * .12;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 4 * height * t * (1 - t) };
}

export function jumpDuration(from, to) { return .32 + Math.hypot(to.x - from.x, to.y - from.y) / 300; }

// Share the highlighted pin between the tutorial prompt and its drawing.
export function pinPracticeTarget(pins, width, viewport, bubble = null) {
  let best = null;
  for (const pin of pins) {
    const x = pin.x * width, y = pin.y, sy = y - viewport.top;
    if (bubble && x > bubble.left - 24 && x < bubble.right + 24 && sy > bubble.top - 40 && sy < bubble.bottom + 24) continue;
    const visible = x >= 17 && x <= width - 17 && sy - 30 >= viewport.header && sy + 10 <= viewport.height;
    const distance = Math.hypot(x - width / 2, sy - viewport.height / 2);
    if (!best || (visible && !best.visible) || (visible === best.visible && distance < best.distance)) best = { x, y, visible, distance };
  }
  return best;
}
