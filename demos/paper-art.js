/* Drawing for the playground's cotton cord and push pins. Pure canvas, no assets. */
const fract = n => n - Math.floor(n);
const hash = (n, salt = 0) => fract(Math.sin(n * 127.1 + salt * 311.7) * 43758.5453);

const CORD = 4.5;       // cord thickness in CSS px
const PITCH = 3;        // distance between twist stripes along the cord
const FIBER_STEP = 1.3; // spacing of potential flyaway fibres

// Redraws one span of cord. `nodes` is the already-smoothed centre line and
// `restLength` gives the material length, so stripes and fibres are glued to the
// cord and do not slide when it bounces or stretches.
export function drawCord(ctx, nodes, restLength) {
  const pts = [], last = nodes.length - 1;
  for (let i = 0; i < last; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const steps = Math.max(1, Math.round(length / FIBER_STEP));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      pts.push({ x: a.x + dx * t, y: a.y + dy * t, tx: dx / length, ty: dy / length, m: (i + t) / last * restLength });
    }
  }
  if (pts.length < 2) return;
  const line = new Path2D();
  pts.forEach((p, i) => i ? line.lineTo(p.x, p.y) : line.moveTo(p.x, p.y));

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pass = (color, width, dx = 0, dy = 0, alpha = 1) => {
    ctx.save(); ctx.translate(dx, dy); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(line); ctx.restore();
  };
  // Shadow on the paper, then the cord body: dark core, red wool, lit upper edge.
  // A wide faint pass under a narrow one reads as a soft shadow without a canvas blur,
  // which is slow to redraw while a string is moving.
  pass('#3a22180f', CORD + 2.8, 2.6, 3.5);
  pass('#4630221f', CORD + .4, 2.6, 3.4);
  pass('#6e0d12', CORD + .2);
  pass('#c9181d', CORD - 1);
  pass('#ec4638', CORD - 2.7, -.35, -.55, .6);

  // Twist: slanted light and dark bands, one pair per pitch, slightly uneven.
  const lit = [new Path2D(), new Path2D()], mid = new Path2D(), dark = new Path2D();
  const half = CORD / 2 + .1, slant = 1.55;
  let lastK = NaN;
  for (const p of pts) {
    const k = Math.floor(p.m / PITCH);
    if (k === lastK) continue;
    lastK = k;
    const nx = -p.ty, ny = p.tx, wobble = (hash(k, 1) - .5) * .7;
    const stripe = (path, shift, w) => {
      const cx = p.x + p.tx * shift, cy = p.y + p.ty * shift;
      path.moveTo(cx - nx * (half + w) - p.tx * slant, cy - ny * (half + w) - p.ty * slant);
      path.lineTo(cx + nx * (half + w) + p.tx * (slant + wobble), cy + ny * (half + w) + p.ty * (slant + wobble));
    };
    stripe(hash(k, 2) > .45 ? lit[0] : lit[1], 0, 0);
    stripe(mid, PITCH * .26, -.2);
    stripe(dark, PITCH * .58, 0);
  }
  const band = (path, color, width, alpha) => { ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'butt'; ctx.stroke(path); };
  band(dark, '#5c090e', 1, .64);
  band(mid, '#e0302a', 1, .55);
  band(lit[0], '#ff8068', 1.05, .8);
  band(lit[1], '#ff6a56', .9, .5);
  ctx.lineCap = 'round';

  // Fibres: short hairs on both edges, a few lying across the body, a few long wisps.
  const hairs = { light: new Path2D(), red: new Path2D(), deep: new Path2D(), lay: new Path2D(), wisp: new Path2D() };
  for (const p of pts) {
    const k = Math.floor(p.m / FIBER_STEP), r = hash(k);
    const nx = -p.ty, ny = p.tx, tx = p.tx, ty = p.ty;
    if (r > .985) {
      // wisp: a long curling hair that leaves the cord at a shallow angle
      const side = hash(k, 2) > .5 ? 1 : -1, L = 3 + hash(k, 3) * 2.6, drift = (hash(k, 4) - .5) * L * 2.2;
      const rx = p.x + nx * side * (CORD / 2 - .4), ry = p.y + ny * side * (CORD / 2 - .4);
      hairs.wisp.moveTo(rx, ry);
      hairs.wisp.quadraticCurveTo(rx + nx * side * L * .3 + tx * drift * .5, ry + ny * side * L * .3 + ty * drift * .5,
        rx + nx * side * L * .5 + tx * drift, ry + ny * side * L * .5 + ty * drift);
    } else if (r < .72) {
      const side = hash(k, 2) > .5 ? 1 : -1, L = 1 + hash(k, 3) ** 2 * 3.4;
      const lean = (hash(k, 4) - .5) * 3.6 * L, curl = (hash(k, 5) - .5) * L * .3;
      const rx = p.x + nx * side * (CORD / 2 - .55), ry = p.y + ny * side * (CORD / 2 - .55);
      const c = hash(k, 6), path = c < .4 ? hairs.light : c < .8 ? hairs.red : hairs.deep;
      path.moveTo(rx, ry);
      path.quadraticCurveTo(rx + nx * side * L * .6 + tx * curl, ry + ny * side * L * .6 + ty * curl,
        rx + nx * side * L * .85 + tx * lean, ry + ny * side * L * .85 + ty * lean);
    } else if (r < .86) {
      const off = (hash(k, 2) - .5) * CORD * .7, len = 1.5 + hash(k, 3) * 2.4, tilt = (hash(k, 4) - .5) * 1.1;
      const rx = p.x + nx * off, ry = p.y + ny * off;
      hairs.lay.moveTo(rx, ry);
      hairs.lay.lineTo(rx + tx * len + nx * tilt, ry + ty * len + ny * tilt);
    }
  }
  const hair = (path, color, width, alpha) => { ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(path); };
  hair(hairs.deep, '#7e0e14', .42, .7);
  hair(hairs.red, '#e0342b', .42, .75);
  hair(hairs.light, '#f7705c', .38, .62);
  hair(hairs.lay, '#ff8670', .33, .32);
  hair(hairs.wisp, '#ef5543', .33, .5);
  ctx.restore();
}

// Push pin ---------------------------------------------------------------
// A glossy plastic tack: flat head, tapered stem, domed base, and a steel needle.
// Drawn once per tilt into a small canvas; `tilt` (radians) leans the whole pin
// around the point where the needle enters the paper.
const BASE_R = 7.6, STEM_TOP = 3.5, STEM_BOTTOM = 3.9, HEAD_R = 6.4, BASE_H = 5.4, STEM_H = 8.4, HEAD_H = 3.6;
export const PIN_HEAD_REACH = 18; // distance from the needle point to the head centre

// Distance from the needle point up to the middle of the stem, where string is tied.
export function pinWaist(tilt) { return 1.4 + BASE_R * Math.abs(Math.sin(tilt)) * .75 + BASE_H + STEM_H * .5; }

// The wrap of cord around a pin's stem, drawn over the pin so the string reads as tied on.
// (x, y) is the waist, `tilt` the pin's lean.
export function drawKnot(ctx, x, y, tilt) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.lineCap = 'round';
  const w = STEM_TOP + .9;
  for (const [dy, color, width] of [[-1.3, '#6e0d12', 2.2], [-1.3, '#c9181d', 1.3], [1.2, '#6e0d12', 2.2], [1.2, '#d9271f', 1.3]]) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(-w, dy - .6); ctx.quadraticCurveTo(0, dy + 1.6, w, dy - .6); ctx.stroke();
  }
  ctx.strokeStyle = '#ff7a64'; ctx.lineWidth = .5; ctx.globalAlpha = .7;
  ctx.beginPath(); ctx.moveTo(-w + 1, -1.9); ctx.quadraticCurveTo(0, -.4, w - 1.5, -1.8); ctx.stroke();
  ctx.restore();
}

export function pinSprite(tilt, scale) {
  const w = 56, h = 56, ox = 28, oy = 42;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
  const g = canvas.getContext('2d');
  g.scale(scale, scale); g.translate(ox, oy);
  const horizontal = (x0, x1, stops) => {
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    stops.forEach(([at, color]) => gr.addColorStop(at, color));
    return gr;
  };
  const glow = (x, y, rx, ry, rot, inner, outer) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
  };

  // Shadows on the paper (light comes from the upper left, so they fall right and down).
  const lean = Math.sin(tilt);
  glow(8 + lean * 7, 4.5, 16, 5.2, .32, 'rgba(56,38,26,.22)', 'rgba(56,38,26,0)');
  glow(1.6, 1.3, 9.5, 3, .1, 'rgba(40,26,18,.42)', 'rgba(40,26,18,0)');

  g.rotate(tilt);
  const gap = 1.4 + BASE_R * Math.abs(lean) * .75;        // visible needle: the base lifts on the leaning side
  const baseBottom = -gap, baseTop = baseBottom - BASE_H, stemTop = baseTop - STEM_H, headBottom = stemTop;

  // Needle, and the dark hole it makes in the paper.
  g.fillStyle = 'rgba(30,20,14,.5)'; g.beginPath(); g.ellipse(0, .2, 1.5, .7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = horizontal(-.9, .9, [[0, '#5a6368'], [.3, '#eef3f4'], [.5, '#ffffff'], [.75, '#97a2a7'], [1, '#444c51']]);
  g.beginPath(); g.moveTo(-.9, 0); g.lineTo(-.9, baseBottom - 1); g.lineTo(.9, baseBottom - 1); g.lineTo(.9, 0); g.closePath(); g.fill();

  // Domed base.
  g.beginPath();
  g.moveTo(-BASE_R, baseBottom);
  g.bezierCurveTo(-BASE_R, baseBottom - BASE_H * .55, -STEM_BOTTOM - 1.2, baseTop + .6, -STEM_BOTTOM, baseTop);
  g.lineTo(STEM_BOTTOM, baseTop);
  g.bezierCurveTo(STEM_BOTTOM + 1.2, baseTop + .6, BASE_R, baseBottom - BASE_H * .55, BASE_R, baseBottom);
  g.ellipse(0, baseBottom, BASE_R, 1.9, 0, 0, Math.PI);
  g.closePath();
  g.fillStyle = horizontal(-BASE_R, BASE_R, [[0, '#8f0810'], [.14, '#d90f18'], [.3, '#ff6a5a'], [.4, '#f2252a'], [.72, '#d10d15'], [1, '#7b050c']]);
  g.fill();
  g.strokeStyle = 'rgba(255,205,190,.55)'; g.lineWidth = .7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-BASE_R + 1.1, baseBottom - .8); g.bezierCurveTo(-BASE_R + 1.2, baseBottom - 3.4, -STEM_BOTTOM - 1.6, baseTop + .9, -STEM_BOTTOM - .4, baseTop + .2); g.stroke();
  g.strokeStyle = 'rgba(70,0,6,.45)'; g.lineWidth = .8;
  g.beginPath(); g.ellipse(0, baseBottom, BASE_R - .3, 1.8, 0, .12, Math.PI - .12); g.stroke();
  g.strokeStyle = 'rgba(255,150,140,.35)'; g.lineWidth = .5;
  g.beginPath(); g.ellipse(0, baseBottom, BASE_R - .9, 1.2, 0, .5, Math.PI - .5); g.stroke();

  // Stem: tapers a little toward the base. Shaded edges and a vertical glint.
  g.beginPath();
  g.moveTo(-STEM_TOP, stemTop); g.lineTo(-STEM_BOTTOM, baseTop); g.lineTo(STEM_BOTTOM, baseTop); g.lineTo(STEM_TOP, stemTop); g.closePath();
  g.fillStyle = horizontal(-STEM_BOTTOM, STEM_BOTTOM, [[0, '#8a0710'], [.16, '#d80f18'], [.32, '#ff7062'], [.42, '#f3282c'], [.78, '#d10e16'], [.93, '#e8353a'], [1, '#8d0810']]);
  g.fill();
  glow(0, baseTop + .2, STEM_BOTTOM + 1.5, 1.6, 0, 'rgba(60,0,4,.38)', 'rgba(60,0,4,0)');
  g.strokeStyle = 'rgba(255,225,215,.55)'; g.lineWidth = .6;
  g.beginPath(); g.moveTo(-STEM_TOP * .42, stemTop + .8); g.lineTo(-STEM_BOTTOM * .42, baseTop - .6); g.stroke();

  // Head: a thick flat disc with a bright upper face.
  const faceY = headBottom - HEAD_H;
  g.beginPath();
  g.moveTo(-HEAD_R, faceY); g.lineTo(-HEAD_R, headBottom - .6);
  g.ellipse(0, headBottom - .6, HEAD_R, 1.7, 0, Math.PI, 0, true);
  g.lineTo(HEAD_R, faceY); g.closePath();
  g.fillStyle = horizontal(-HEAD_R, HEAD_R, [[0, '#930912'], [.18, '#d80f18'], [.34, '#ff6657'], [.46, '#ed1f26'], [.8, '#c60d14'], [1, '#810609']]);
  g.fill();
  g.beginPath(); g.ellipse(0, faceY, HEAD_R, 2.1, 0, 0, Math.PI * 2);
  g.fillStyle = horizontal(-HEAD_R, HEAD_R, [[0, '#e5232a'], [.3, '#ff7b6b'], [.55, '#f23a3a'], [1, '#c70f17']]); g.fill();
  g.strokeStyle = 'rgba(120,0,8,.4)'; g.lineWidth = .5; g.stroke();
  g.strokeStyle = 'rgba(255,230,222,.8)'; g.lineWidth = .65;
  g.beginPath(); g.ellipse(-.4, faceY - .1, HEAD_R - 1.3, 1.45, 0, Math.PI * 1.05, Math.PI * 1.55); g.stroke();
  g.strokeStyle = 'rgba(255,205,195,.5)'; g.lineWidth = .55;
  g.beginPath(); g.moveTo(-HEAD_R + .6, faceY + .6); g.lineTo(-HEAD_R + .6, headBottom - 1.4); g.stroke();
  glow(-2.4, faceY - .5, 2.4, .9, -.1, 'rgba(255,248,240,.9)', 'rgba(255,248,240,0)');
  return { canvas, ox, oy, w, h };
}
