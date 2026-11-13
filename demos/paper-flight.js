const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

// A controlled glide with no jump arc or somersault, easing onto the landing.
export function flightPoint(from, to, t) {
  const u = smooth(Math.max(0, Math.min(1, t)));
  return { x: mix(from.x, to.x, u), y: mix(from.y, to.y, u) };
}

// Caught mid-fall: the canopy brakes him from speed, so the glide starts quick and settles
// onto the ledge instead of stopping dead in the air and speeding up again.
export function caughtPoint(from, to, t) {
  const u = 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
  return { x: mix(from.x, to.x, u), y: mix(from.y, to.y, u) };
}

// Two graphite passes keep the equipment in the figure's pencil vocabulary.
function pencil(ctx, path, shade = false) {
  if (shade) { ctx.fillStyle = '#f8f6ef'; ctx.fill(path); }
  ctx.strokeStyle = '#252522'; ctx.lineWidth = 1.2; ctx.stroke(path);
  ctx.save(); ctx.translate(.55, -.35); ctx.globalAlpha *= .25;
  ctx.lineWidth = .55; ctx.stroke(path); ctx.restore();
}

export function drawFlightGear(ctx, pose, kind, progress, clock, facing, powered = true) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'parachute') {
    const deploy = smooth(Math.min(1, progress / .12));
    const cx = pose.shoulder.x + Math.sin(clock * 2.6) * 2 * deploy;
    const cy = pose.head.y - 29, w = 33 * Math.max(.08, deploy);
    const canopy = new Path2D();
    canopy.moveTo(cx - w, cy);
    canopy.bezierCurveTo(cx - w, cy - 39 * deploy, cx + w, cy - 39 * deploy, cx + w, cy);
    for (let i = 3; i >= 0; i--) {
      const x = cx - w + i * w / 2;
      canopy.quadraticCurveTo(x + w / 4, cy - 12 * deploy, x, cy);
    }
    canopy.closePath(); pencil(ctx, canopy, true);
    const seams = new Path2D();
    for (const n of [-.5, 0, .5]) {
      seams.moveTo(cx, cy - 29 * deploy);
      seams.quadraticCurveTo(cx + n * w * .9, cy - 25 * deploy, cx + n * w, cy);
    }
    pencil(ctx, seams);
    const lines = new Path2D();
    for (let i = 0; i <= 4; i++) {
      const hand = pose.arms[i < 2 ? 1 : 0].end;
      lines.moveTo(cx - w + i * w / 2, cy);
      lines.lineTo(hand.x, hand.y);
    }
    ctx.globalAlpha = .7; pencil(ctx, lines);
  } else {
    // The inner tank edge rests against his spine and follows his forward lean.
    // It scales with him (he is drawn larger on the tool tour).
    // Facing 0 is front on: both tanks show either side of his spine, with a fin on each.
    // Side on, the near tank hides the far one, so only one tank and the far-side fin are drawn.
    const k = Math.hypot(pose.shoulder.x - pose.hip.x, pose.shoulder.y - pose.hip.y) / 12.8;
    const front = facing === 0;
    ctx.translate(pose.shoulder.x, pose.shoulder.y);
    ctx.rotate(Math.atan2(pose.shoulder.x - pose.hip.x, pose.hip.y - pose.shoulder.y));
    ctx.translate(-facing * 3.6 * k, 0);
    ctx.scale(k, k);
    const fins = new Path2D(), edge = front ? 8 : 3.6;
    for (const back of front ? [-1, 1] : [-facing]) {
      fins.moveTo(back * edge, 5); fins.quadraticCurveTo(back * (edge + 7), 7, back * (edge + 9), 17); fins.lineTo(back * edge, 13);
    }
    pencil(ctx, fins);
    const flare = 11 + Math.sin(clock * 29) * 2;
    for (const x of front ? [-5, 5] : [0]) {
      if (powered) {
        const flame = new Path2D();
        flame.moveTo(x - 2.8, 17); flame.quadraticCurveTo(x - 4, 23, x, 17 + flare);
        flame.quadraticCurveTo(x + 4, 23, x + 2.8, 17);
        flame.moveTo(x, 19); flame.lineTo(x - 1, 23); flame.lineTo(x + 1, 22);
        pencil(ctx, flame);
      }
      const tank = new Path2D();
      tank.roundRect(x - 3.6, 0, 7.2, 15, 2.5);
      tank.rect(x - 2.8, 15, 5.6, 2.5);
      pencil(ctx, tank, true);
      const hatch = new Path2D();
      for (let y = 3; y < 13; y += 2) {
        hatch.moveTo(x - 2.5, y + 1); hatch.lineTo(x - .7, y - .3);
      }
      ctx.save(); ctx.globalAlpha = .4; pencil(ctx, hatch); ctx.restore();
    }
  }
  ctx.restore();
}

// Puffs stay in page space, so they linger along the route instead of following him.
export function createJetSmoke() {
  const puffs = [];
  let elapsed = 0, sequence = 0;
  return {
    get active() { return puffs.length > 0; },
    step(dt, nozzle = null) {
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt; p.y += dt * 65; p.x += dt * p.drift;
        if (p.age >= .9) puffs.splice(i, 1);
      }
      if (!nozzle) { elapsed = 0; return; }
      elapsed += dt;
      while (elapsed >= .045) {
        elapsed -= .045;
        const side = sequence++ % 2 ? -1 : 1;
        puffs.push({ x: nozzle.x + side * 5, y: nozzle.y, age: 0,
          drift: side * (12 + Math.sin(sequence * 2.4) * 7), seed: sequence });
      }
    },
    draw(ctx, inView = () => true) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const p of puffs) {
        const t = p.age / .9, r = 5 + smooth(t) * 18;
        if (!inView(p.y - r, p.y + r, 2)) continue;
        ctx.globalAlpha = .7 * (1 - smooth(t));
        const cloud = new Path2D();
        for (let i = 0; i <= 60; i++) {
          const angle = i / 60 * Math.PI * 2;
          const radius = r * (1 + .15 * Math.cos(angle * 6 + p.seed));
          const x = p.x + Math.cos(angle) * radius, y = p.y + Math.sin(angle) * radius * .8;
          if (i === 0) cloud.moveTo(x, y); else cloud.lineTo(x, y);
        }
        cloud.closePath(); pencil(ctx, cloud, true);
        const curl = new Path2D();
        curl.moveTo(p.x - r * .45, p.y + r * .15);
        curl.quadraticCurveTo(p.x - r * .5, p.y - r * .4, p.x, p.y - r * .25);
        pencil(ctx, curl);
      }
      ctx.restore();
    }
  };
}
