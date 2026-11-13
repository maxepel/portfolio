// Small position-based ragdoll. A grip constrains a point along a bone, so the
// same arm, leg, or torso point stays under the pointer as the rest swings freely.
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function poseBones(pose) {
  const bones = [{ part: 'torso', a: 'hip', b: 'shoulder' }];
  for (const kind of ['arms', 'legs']) for (let side = 0; side < 2; side++) {
    const prefix = `${kind}${side}`;
    bones.push({ part: `${kind}-${side}`, a: `${prefix}Root`, b: `${prefix}Joint` },
      { part: `${kind}-${side}`, a: `${prefix}Joint`, b: `${prefix}End` });
  }
  const points = { hip: pose.hip, shoulder: pose.shoulder, head: pose.head };
  for (const kind of ['arms', 'legs']) pose[kind].forEach((limb, side) => {
    for (const key of ['root', 'joint', 'end']) points[`${kind}${side}${key[0].toUpperCase()}${key.slice(1)}`] = limb[key];
  });
  return { bones, points };
}

export function hitGrab(pose, point, radius = 6, part = null) {
  if (!pose || distance(point, pose.head) < 5.5) return null;
  const { bones, points } = poseBones(pose);
  let best = null, nearest = radius;
  for (const bone of bones) {
    if (part && bone.part !== part) continue;
    const a = points[bone.a], b = points[bone.b], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const at = lerp(a, b, t), d = distance(at, point);
    if (d <= nearest) { nearest = d; best = { ...bone, t, point: at }; }
  }
  return best;
}

export function createGrab(pose, grip) {
  const { bones, points: initial } = poseBones(pose), points = {};
  const aliases = {};
  for (const [key, p] of Object.entries(initial)) {
    // Shared roots must be the same particle, so arms and legs cannot detach.
    const existing = /^legs\dRoot$/.test(key) ? 'hip' : Object.keys(points).find(name => initial[name] === p ||
      (/^arms\dRoot$/.test(key) && name === 'shoulder' && distance(initial[name], p) < 1e-8));
    aliases[key] = existing || key;
    if (!existing) points[key] = { ...p, px: p.x, py: p.y, weight: key === 'hip' || key === 'shoulder' ? .6 : 1 };
  }
  const links = [];
  const link = (a, b) => {
    a = aliases[a]; b = aliases[b];
    if (a !== b) links.push({ a, b, length: distance(points[a], points[b]) });
  };
  bones.forEach(b => link(b.a, b.b));
  // The head and arm roots stay attached to a rigid torso; limbs remain jointed.
  link('shoulder', 'head'); link('hip', 'head');
  for (let side = 0; side < 2; side++) {
    link('shoulder', `arms${side}Root`); link('hip', `arms${side}Root`);
  }
  return { points, aliases, links, grip: { ...grip, a: aliases[grip.a], b: aliases[grip.b] },
    target: { ...grip.point }, dt: 1 / 120 };
}

export function gripPoint(rig) {
  return lerp(rig.points[rig.grip.a], rig.points[rig.grip.b], rig.grip.t);
}

export function stepGrab(rig, dt, target = rig.target, reduced = false) {
  if (!(dt > 0)) return;
  // Subdivide quick pointer jumps too, so a long drag cannot stretch an arm
  // before the positional constraints have had time to propagate to the torso.
  const travel = target && rig.target ? distance(target, rig.target) : 0;
  const steps = Math.max(1, Math.ceil(dt * 120), Math.min(256, Math.ceil(travel / 2)));
  const h = Math.min(dt / steps, 1 / 120);
  const start = rig.target;
  for (let step = 0; step < steps; step++) {
    const anchor = target && lerp(start || target, target, (step + 1) / steps);
    for (const p of Object.values(rig.points)) {
      const vx = Math.max(-900, Math.min(900, (p.x - p.px) / rig.dt));
      const vy = Math.max(-900, Math.min(900, (p.y - p.py) / rig.dt));
      p.px = p.x; p.py = p.y;
      const damping = Math.exp(-(reduced ? 18 : 2.2) * h);
      p.x += vx * damping * h; p.y += vy * damping * h + 1400 * h * h;
    }
    for (let iteration = 0; iteration < 96; iteration++) {
      for (const link of rig.links) {
        const a = rig.points[link.a], b = rig.points[link.b];
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        if (length < 1e-8) continue;
        const error = (length - link.length) / length / (a.weight + b.weight);
        a.x += dx * error * a.weight; a.y += dy * error * a.weight;
        b.x -= dx * error * b.weight; b.y -= dy * error * b.weight;
      }
      if (anchor) {
        const { a: aKey, b: bKey, t } = rig.grip, a = rig.points[aKey], b = rig.points[bKey];
        const at = gripPoint(rig), weight = (1 - t) ** 2 * a.weight + t * t * b.weight;
        const dx = (anchor.x - at.x) / weight, dy = (anchor.y - at.y) / weight;
        a.x += dx * (1 - t) * a.weight; a.y += dy * (1 - t) * a.weight;
        b.x += dx * t * b.weight; b.y += dy * t * b.weight;
      }
    }
    if (anchor) {
      // Finish with an exact grip without changing any bone lengths.
      const at = gripPoint(rig), dx = anchor.x - at.x, dy = anchor.y - at.y;
      for (const p of Object.values(rig.points)) { p.x += dx; p.y += dy; }
    }
    rig.dt = h;
  }
  rig.target = target && { ...target };
}

export function grabPose(rig) {
  const point = key => rig.points[rig.aliases[key]];
  const pose = { hip: point('hip'), shoulder: point('shoulder'), head: point('head'), arms: [], legs: [], crawl: 0 };
  for (const kind of ['arms', 'legs']) for (let side = 0; side < 2; side++) {
    pose[kind].push({ root: point(`${kind}${side}Root`), joint: point(`${kind}${side}Joint`), end: point(`${kind}${side}End`) });
  }
  return pose;
}

export function grabBody(rig) {
  const pose = grabPose(rig), lowest = Object.values(rig.points).reduce((a, b) => a.y > b.y ? a : b);
  return { x: pose.hip.x, y: lowest.y };
}
