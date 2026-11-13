// Small position-based rope solver. Coordinates and lengths are in CSS pixels.
export function createRope(a, b, previous = null) {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const count = Math.max(10, Math.min(40, Math.ceil(chord / 12)));
  const restLength = previous?.restLength ?? Math.max(12, chord * 1.045 + 5);
  const sag = Math.min(45, Math.sqrt(Math.max(0, restLength ** 2 - chord ** 2)) * .34);
  const nodes = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    if (previous) {
      const p = sampleRope(previous, t);
      return { x: p.x, y: p.y, px: p.x, py: p.y };
    }
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t + 4 * sag * t * (1 - t);
    return { x, y, px: x, py: y };
  });
  return { nodes, restLength, length: restLength, tension: 0 };
}

export function sampleRope(rope, u) {
  const last = rope.nodes.length - 1;
  const at = Math.max(0, Math.min(1, u)) * last;
  const i = Math.min(last - 1, Math.floor(at));
  const a = rope.nodes[i], b = rope.nodes[i + 1], t = at - i;
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * t, y: a.y + dy * t, tx: dx / length, ty: dy / length, index: i, t };
}

export function stepRope(rope, a, b, dt, load = null, reduced = false) {
  const nodes = rope.nodes, last = nodes.length - 1;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  // The original length is preserved while dragging. Beyond it, cotton stretches
  // slightly instead of asking an impossible constraint to explode.
  const segment = Math.max(rope.restLength, chord * 1.00015) / last;
  rope.tension = Math.max(0, Math.min(1, (chord / rope.restLength - .98) / .025));
  const compliance = 1 - rope.tension * .93;
  const damping = reduced ? .9 : .987;
  for (let i = 1; i < last; i++) {
    const p = nodes[i], vx = (p.x - p.px) * damping, vy = (p.y - p.py) * damping;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + 420 * compliance * dt * dt;
    if (load) {
      const near = Math.abs(i / last - load.u) * last;
      const weight = Math.max(0, 1 - near / 2);
      p.y += weight * (load.force ?? 2600) * compliance * dt * dt;
    }
  }
  // `rope.hold` pins one bead to a hand (a grab, or the slingshot pull). Its previous
  // position is left alone, so letting go keeps the hand's speed: a twang.
  const anchor = () => {
    Object.assign(nodes[0], { x: a.x, y: a.y, px: a.x, py: a.y });
    Object.assign(nodes[last], { x: b.x, y: b.y, px: b.x, py: b.y });
    const held = rope.hold && nodes[rope.hold.i];
    if (held) { held.x = rope.hold.x; held.y = rope.hold.y; }
  };
  anchor();
  for (let iteration = 0; iteration < 22; iteration++) {
    // Alternate directions to avoid biasing the left and right ends.
    for (let n = 0; n < last; n++) {
      const i = iteration % 2 ? last - 1 - n : n;
      const p = nodes[i], q = nodes[i + 1];
      const dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy);
      if (length < .00001) continue;
      const error = (length - segment) / length;
      const left = i === 0 ? 0 : 1, right = i + 1 === last ? 0 : 1;
      const stiffness = .88 / (left + right || 1);
      p.x += dx * error * stiffness * left; p.y += dy * error * stiffness * left;
      q.x -= dx * error * stiffness * right; q.y -= dy * error * stiffness * right;
    }
    anchor();
  }
  let length = 0, energy = 0;
  for (let i = 1; i <= last; i++) {
    const p = nodes[i], prev = nodes[i - 1];
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    energy += (p.x - p.px) ** 2 + (p.y - p.py) ** 2;
  }
  rope.length = length;
  return energy;
}

export function kickRope(rope, u, impulse = 12) {
  const last = rope.nodes.length - 1;
  for (let i = 1; i < last; i++) {
    const weight = Math.max(0, 1 - Math.abs(i / last - u) * last / 2.5);
    rope.nodes[i].py -= impulse / 120 * weight;
  }
}

export function sampleCourse(ropes, position) {
  if (!ropes.length) return null;
  const at = Math.max(0, Math.min(ropes.length, position));
  const span = Math.min(ropes.length - 1, Math.floor(at));
  return { ...sampleRope(ropes[span], at - span), span, u: at - span };
}

export function travelCourse(ropes, position, pixels) {
  if (!ropes.length) return 0;
  let at = Math.max(0, Math.min(ropes.length, position));
  let remaining = pixels;
  // Consume distance in each material segment, so changing spans or crossing a
  // pin remains continuous even when neighboring strings have different lengths.
  for (let count = 0; count < ropes.length + 1 && Math.abs(remaining) > .00001; count++) {
    const backwards = remaining < 0;
    const span = Math.min(ropes.length - 1, Math.max(0, backwards ? Math.ceil(at) - 1 : Math.floor(at)));
    const length = Math.max(1, ropes[span].length);
    const available = backwards ? (at - span) * length : (span + 1 - at) * length;
    if (Math.abs(remaining) <= available) return at + remaining / length;
    remaining += backwards ? available : -available;
    at = backwards ? span : span + 1;
    if (at <= 0 || at >= ropes.length) return at;
  }
  return at;
}
