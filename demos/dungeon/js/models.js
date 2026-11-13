// Characters, weapons, and props painted voxel by voxel on the character grid
// (1/3 of the 25 cm world voxel = 8.33 cm). Port of the Godot VoxModels, Level 1 subset
// (skeleton, Bone Warden, bat, mimic) plus every prop and weapon the level can show.
// Character space: x = the model's left (+x) / right (-x), y up, z = front (+Z).
import { Vox, box, ellipsoid, line, hash3 } from './vox.js';

export const CV = 0.25 / 3.0;

// Seeded RNG with the Godot RandomNumberGenerator calls the models use.
export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  randf() { return this.next(); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
}

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const V3 = (x = 0, y = 0, z = 0) => [x, y, z];
const ONE = [1, 1, 1];

function part(parts, name, vox, pivot, parent = '') { parts.push({ name, vox, pivot, parent }); }

function roundTop(d, y, x0, x1, z0, z1) {
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) d.delete(x, y, z);
}

// =============================================================================
// Characters
// =============================================================================
export function character(role) {
  switch (role) {
    case 'bone_warden': return boneWarden();
    case 'bat': return bat();
    case 'mimic': return mimic();
    default: return skeleton();
  }
}

function skeleton() {
  const parts = [];
  const h = new Vox();
  box(h, -2, 2, 5, 5, -1, 0, 'bone2');
  box(h, -1, 1, 4, 4, 1, 1, 'cloth_r2');
  h.set(0, 3, 1, 'cloth_r2');
  h.set(-1, 4, -1, 'cloth_r2');
  part(parts, 'hips', h, V3(0.5, 5.5, 0.0));
  for (const side of [-1, 1]) {                        // legs: thin bones, a knee knob, long feet
    const d = new Vox();
    const x = side > 0 ? 1 : -2;
    box(d, x, x, 1, 4, 0, 0, 'bone');
    d.set(x, 2, 1, 'bone2');
    box(d, x, x, 0, 0, -1, 2, 'bone2');
    d.set(x - side, 0, 2, 'bone3');
    part(parts, side > 0 ? 'leg.L' : 'leg.R', d, V3(x + 0.5, 5.0, 0.5), 'hips');
  }
  const t = new Vox();                                  // torso: spine + rib cage shell + collar bar
  box(t, 0, 0, 6, 11, -1, -1, 'bone2');
  for (const y of [7, 9]) {
    for (let x = -3; x <= 3; x++)
      for (let z = -2; z <= 1; z++)
        if (Math.abs(x) === 3 || z === -2 || z === 1)
          if (!(z === 1 && x === 0)) t.set(x, y, z, y === 9 ? 'bone' : 'bone2');
  }
  box(t, 0, 0, 7, 10, 1, 1, 'bone');
  box(t, -4, 4, 10, 10, -1, 0, 'bone');
  box(t, -3, 3, 8, 8, -2, -2, 'bone3');
  part(parts, 'torso', t, V3(0.5, 6.0, 0.0), 'hips');
  for (const side of [-1, 1]) {                         // arms; the right one (-x) carries a rusty short sword
    const d = new Vox();
    const x = 4 * side;
    box(d, x, x, 5, 10, 0, 0, 'bone');
    d.set(x, 7, 0, 'bone2');
    box(d, x, x, 4, 4, 0, 1, 'bone2');
    if (side < 0) {
      box(d, x, x, 4, 4, -1, 1, 'leather');
      box(d, x - 1, x + 1, 4, 4, 2, 2, 'iron2');
      box(d, x, x, 4, 4, 3, 10, 'steel2');
      for (const z of [5, 8]) d.set(x, 4, z, 'rust');
      d.set(x, 4, 11, 'steel');
      d.set(x, 4, -2, 'rust');
    }
    part(parts, side > 0 ? 'arm.L' : 'arm.R', d, V3(x + 0.5, 10.5, 0.5), 'torso');
  }
  const s = new Vox();                                  // skull 9 wide, glowing sockets, jaw separate
  box(s, -4, 4, 13, 19, -3, 3, 'bone');
  for (let x = -4; x <= 4; x++)
    for (let z = -3; z <= 3; z++)
      if ((Math.abs(x) === 4 || Math.abs(z) === 3) && hash3(x, 19, z) > 0.2) s.delete(x, 19, z);
  roundTop(s, 18, -4, 4, -3, 3);
  box(s, -4, 4, 13, 13, -3, 3, 'bone2');
  box(s, -3, 3, 19, 19, -2, 2, 'bone');
  s.set(1, 19, 0, 'bone3'); s.set(2, 18, -1, 'bone3');
  for (const ex of [-3, 1]) {
    for (let x = ex; x < ex + 3; x++)
      for (let y = 15; y < 17; y++) { s.delete(x, y, 3); s.set(x, y, 2, 'socket'); }
    s.set(ex + 1, 15, 2, 'eye_g');
    s.set(ex + 1, 16, 2, 'eye_g2');
  }
  s.delete(0, 14, 3); s.set(0, 14, 2, 'socket');
  for (let x = -3; x <= 3; x++) s.set(x, 13, 3, x % 2 === 0 ? 'teeth' : 'socket');
  part(parts, 'head', s, V3(0.5, 12.0, 0.0), 'torso');
  const j = new Vox();
  box(j, -3, 3, 12, 12, -1, 3, 'bone2');
  for (let x = -3; x <= 3; x += 2) j.set(x, 12, 3, 'teeth');
  box(j, -1, 1, 11, 11, 0, 0, 'bone2');
  part(parts, 'jaw', j, V3(0.5, 12.5, -0.5), 'torso');
  return {
    parts, height: 20 * CV, shape: 'humanoid',
    collapse: {
      hips: [V3(0.0, 0.3, 0.0), V3(0, -4.6, 0), ONE],
      'leg.L': [V3(-1.45, 0.4, 0.3), V3(), ONE],
      'leg.R': [V3(1.4, -0.5, -0.2), V3(), ONE],
      torso: [V3(-1.35, 0.2, 0.15), V3(0, -0.5, 0), ONE],
      'arm.L': [V3(0.3, 0.0, 1.4), V3(), ONE],
      'arm.R': [V3(-0.2, 0.0, -1.5), V3(), ONE],
      head: [V3(0.6, 1.1, 0.5), V3(2.0, -2.0, -1.0), ONE],
      jaw: [V3(0.9, 0.0, 0.0), V3(-1.0, -1.0, 1.0), ONE],
    },
  };
}

function boneWarden() {
  const parts = [];
  const h = new Vox();
  box(h, -4, 4, 9, 10, -2, 1, 'bone2');
  for (let x = -5; x <= 5; x++)                          // iron fauld plates
    box(h, x, x, x % 2 === 0 ? 7 : 6, 9, 2, 2, x % 2 === 0 ? 'iron' : 'iron3');
  box(h, -5, 5, 10, 10, -3, 2, 'iron2');
  h.set(0, 10, 3, 'gold');
  part(parts, 'hips', h, V3(0.5, 9.5, 0.0));
  for (const side of [-1, 1]) {
    const d = new Vox();
    const x0 = side > 0 ? 1 : -3;
    box(d, x0, x0 + 1, 2, 8, -1, 0, 'bone');
    box(d, x0 - 1, x0 + 2, 4, 5, -1, 1, 'bone2');        // knee
    box(d, x0 - 1, x0 + 2, 0, 2, -2, 2, 'iron');         // greave boots
    box(d, x0 - 1, x0 + 2, 0, 0, 3, 3, 'iron3');
    box(d, x0 - 1, x0 + 2, 2, 2, -2, 2, 'iron2');
    part(parts, side > 0 ? 'leg.L' : 'leg.R', d, V3(x0 + 1.0, 9.0, 0.0), 'hips');
  }
  const t = new Vox();                                   // torso: rib cage, spine, cape, pauldrons
  box(t, 0, 0, 11, 19, -2, -1, 'bone2');
  for (const y of [12, 14, 16, 18]) {
    for (let x = -5; x <= 5; x++)
      for (let z = -3; z <= 2; z++)
        if (Math.abs(x) === 5 || z === -3 || z === 2)
          if (!(z === 2 && Math.abs(x) <= 0)) t.set(x, y, z, y % 4 === 2 ? 'bone' : 'bone2');
  }
  box(t, 0, 0, 12, 18, 2, 2, 'bone');
  box(t, -6, 6, 19, 19, -2, 1, 'bone');
  for (const side of [-1, 1]) {                          // big iron pauldrons with a bone spike
    const px = 7 * side;
    box(t, px - 2, px + 2, 18, 20, -3, 2, 'iron');
    box(t, px - 2, px + 2, 21, 21, -2, 1, 'iron2');
    box(t, px - 2, px + 2, 18, 18, -3, 2, 'iron3');
    t.set(px, 22, 0, 'bone'); t.set(px, 23, 0, 'bone'); t.set(px, 24, -1, 'bone2');
    t.set(px + side, 20, 3, 'gold');
  }
  for (let x = -6; x <= 6; x++) {                        // tattered cape
    const bottom = 4 + Math.floor(hash3(x, 0, 0, 3) * 4.0);
    for (let y = bottom; y < 20; y++) t.set(x, y, -5, (x + y) % 5 !== 0 ? 'cloth_r' : 'cloth_r2');
    t.set(x, 19, -4, 'cloth_r2');
  }
  part(parts, 'torso', t, V3(0.5, 10.5, 0.0), 'hips');
  for (const side of [-1, 1]) {                          // right arm (-x): heavy bone mace; left arm (+x): tower shield
    const d = new Vox();
    const ax = 9 * side;
    const x0 = side > 0 ? ax : ax - 1;
    box(d, x0, x0 + 1, 10, 18, -1, 0, 'bone');
    box(d, x0 - 1, x0 + 2, 13, 14, -1, 0, 'bone2');
    box(d, x0 - 1, x0 + 2, 8, 10, -2, 1, 'iron');        // gauntlet
    if (side < 0) {
      box(d, x0, x0 + 1, 9, 9, -3, 10, 'wood2');         // haft forward
      box(d, x0, x0 + 1, 9, 9, -4, -4, 'iron2');
      for (const z of [0, 4, 8]) box(d, x0, x0 + 1, 9, 9, z, z, 'leather');
      box(d, x0 - 2, x0 + 3, 7, 11, 11, 15, 'iron');     // mace head
      box(d, x0 - 1, x0 + 2, 6, 12, 12, 14, 'iron2');
      box(d, x0 - 3, x0 + 4, 8, 10, 12, 14, 'iron2');
      box(d, x0 - 1, x0 + 2, 8, 10, 16, 16, 'iron3');
      for (const [sx, sy, sz] of [[x0, 5, 13], [x0, 13, 13], [x0 - 4, 9, 13], [x0 + 5, 9, 13], [x0, 9, 17]]) d.set(sx, sy, sz, 'bone');
    } else {
      // tower shield in front of the left side, facing +Z
      for (let x = 4; x <= 14; x++) {
        for (let y = 3; y <= 21; y++) {
          const edge = x === 4 || x === 14 || y === 3 || y === 21;
          const topCut = y === 21 && (x === 4 || x === 14);
          if (topCut) continue;
          d.set(x, y, 4, edge ? 'iron2' : ((x + y) % 4 ? 'wood3' : 'wood2'));
          d.set(x, y, 3, 'iron3');
        }
      }
      for (let y = 5; y < 20; y++) d.set(9, y, 5, 'iron');
      for (let x = 6; x < 13; x++) d.set(x, 12, 5, 'iron');
      box(d, 7, 11, 12, 16, 5, 5, 'bone');               // bone skull emblem with glowing eyes
      box(d, 8, 10, 11, 11, 5, 5, 'bone2');
      d.set(8, 14, 6, 'eye_g'); d.set(10, 14, 6, 'eye_g');
      d.set(9, 13, 6, 'socket');
      for (const [rx, ry, rz] of [[5, 4, 5], [13, 4, 5], [5, 20, 5], [13, 20, 5]]) d.set(rx, ry, rz, 'gold');
    }
    part(parts, side > 0 ? 'arm.L' : 'arm.R', d, V3(x0 + 1.0, 18.5, 0.0), 'torso');
  }
  const s = new Vox();                                   // skull 11 wide under a horned iron helm
  box(s, -5, 5, 21, 30, -4, 4, 'bone');
  roundTop(s, 30, -5, 5, -4, 4);
  box(s, -5, 5, 21, 21, -4, 4, 'bone2');
  for (const ex of [-4, 1]) {
    for (let x = ex; x < ex + 4; x++)
      for (let y = 24; y < 27; y++) { s.delete(x, y, 4); s.set(x, y, 3, 'socket'); }
    s.set(ex + 1, 25, 3, 'eye_g'); s.set(ex + 2, 25, 3, 'eye_g');
    s.set(ex + 1, 26, 3, 'eye_g2');
  }
  s.delete(0, 23, 4); s.set(0, 23, 3, 'socket');
  for (let x = -4; x <= 4; x++) s.set(x, 22, 4, x % 2 === 0 ? 'teeth' : 'socket');
  for (let x = -6; x <= 6; x++) {                        // helm
    for (let z = -5; z <= 5; z++) {
      for (let y = 27; y < 32; y++) {
        const shell = Math.abs(x) === 6 || Math.abs(z) === 5 || y === 31;
        if (shell && !(z === 5 && y < 29 && Math.abs(x) < 5)) s.set(x, y, z, y !== 27 ? 'iron' : 'iron2');
      }
    }
  }
  roundTop(s, 31, -6, 6, -5, 5);
  box(s, -1, 1, 26, 31, 5, 5, 'iron2');                  // nasal guard
  box(s, -6, 6, 28, 28, 5, 5, 'gold');                   // crown band
  for (const side of [-1, 1]) {                          // horns
    for (let i = 0; i < 6; i++) {
      const hx = side * (7 + Math.trunc(i / 2));
      const hy = 30 + i;
      s.set(hx, hy, 0, i < 4 ? 'bone' : 'bone2');
      s.set(hx, hy, -1, 'bone2');
      if (i < 3) s.set(hx - side, hy, 0, 'bone2');
    }
  }
  part(parts, 'head', s, V3(0.5, 20.0, 0.0), 'torso');
  const j = new Vox();
  box(j, -4, 4, 20, 20, -2, 4, 'bone2');
  for (let x = -4; x <= 4; x += 2) j.set(x, 21, 4, 'teeth');
  part(parts, 'jaw', j, V3(0.5, 20.5, -1.5), 'torso');
  return {
    parts, height: 32 * CV, shape: 'humanoid',
    collapse: {
      hips: [V3(0, 0.2, 0), V3(0, -8.5, 0), ONE],
      'leg.L': [V3(-1.45, 0.3, 0.2), V3(), ONE],
      'leg.R': [V3(1.4, -0.4, -0.2), V3(), ONE],
      torso: [V3(-1.3, 0.1, 0.1), V3(0, -1.0, 0), ONE],
      'arm.L': [V3(0.2, 0.0, 1.2), V3(), ONE],
      'arm.R': [V3(-0.3, 0.0, -1.4), V3(), ONE],
      head: [V3(0.5, 1.4, 0.6), V3(3.0, -3.0, -2.0), ONE],
      jaw: [V3(1.0, 0, 0), V3(-2.0, -2.0, 2.0), ONE],
    },
  };
}

function bat() {
  const parts = [];
  const b = new Vox();
  ellipsoid(b, V3(0.5, 3.0, 0.5), V3(2.6, 2.6, 2.4), 'bat');
  for (const [x, y, z] of b.keysArray()) if (y <= 1) b.set(x, y, z, 'bat2');
  for (const side of [-1, 1]) {                          // ears
    const ex = side > 0 ? 2 : -2;
    b.set(ex, 5, 0, 'bat'); b.set(ex, 6, 0, 'batear'); b.set(ex, 5, 1, 'batear');
    b.set(ex - side, 5, 0, 'bat');
  }
  b.set(-1, 3, 3, 'eye_r'); b.set(1, 3, 3, 'eye_r');
  b.set(0, 2, 3, 'batear');                              // snout
  b.set(-1, 1, 2, 'teeth'); b.set(1, 1, 2, 'teeth');
  b.set(-1, 0, 0, 'batw2'); b.set(1, 0, 0, 'batw2');     // feet
  part(parts, 'body', b, V3(0.5, 3.0, 0.5));
  for (const side of [-1, 1]) {
    const d = new Vox();
    for (let i = 1; i < 10; i++) {
      const x = (2 + i) * side;
      const zFront = 2 - Math.trunc(i / 4);
      let zBack = -3 + (i % 3);
      if (i > 7) zBack = 0;
      for (let z = zBack; z <= zFront; z++) d.set(x, 3 + (i < 3 ? 1 : 0), z, z < zFront ? 'batw' : 'batw2');
    }
    d.set(12 * side, 3, 1, 'batw2');                     // wing claw
    part(parts, side > 0 ? 'wing.L' : 'wing.R', d, V3(2.5 * side + 0.5, 3.5, 0.5), 'body');
  }
  return {
    parts, height: 7 * CV, shape: 'bat',
    collapse: {
      body: [V3(0.3, 0, 2.8), V3(0, -15.0, 0), ONE],
      'wing.L': [V3(0, 0, 0.5), V3(), ONE],
      'wing.R': [V3(0, 0, -0.5), V3(), ONE],
    },
  };
}

function mimic() {
  const parts = [];
  const [body, lid] = chestVox(false);
  for (let x = -4; x <= 4; x++) {                        // inside: tongue, teeth along both rims, glowing eyes
    body.delete(x, 5, 0); body.delete(x, 5, 1); body.delete(x, 5, -1);
    body.set(x, 4, 0, 'mouth');
  }
  for (let x = -4; x <= 4; x += 2) {
    body.set(x, 6, 3, 'teeth');
    lid.set(x, 5, 3, 'teeth');
  }
  box(body, -1, 1, 5, 5, -1, 4, 'tongue');
  body.set(0, 4, 5, 'tongue');
  lid.set(-2, 6, 1, 'eye_y'); lid.set(2, 6, 1, 'eye_y');
  part(parts, 'body', body, V3(0.5, 0.0, 0.5));
  part(parts, 'lid', lid, V3(0.5, 6.0, -3.0), 'body');
  return {
    parts, height: 10 * CV, shape: 'mimic',
    collapse: { body: [V3(0, 0, 0.6), V3(0, -0.5, 0), ONE], lid: [V3(-1.6, 0, 0), V3(), ONE] },
  };
}

// =============================================================================
// Weapons (grip at the origin, blade along +Y)
// =============================================================================
export function weapon(id) {
  const d = new Vox();
  switch (id) {
    case 'warhammer':
      box(d, 0, 0, -3, 11, 0, 0, 'wood2');
      for (const y of [-1, 2]) d.set(0, y, 0, 'leather');
      box(d, -3, 3, 11, 14, -1, 1, 'iron');
      box(d, -3, 3, 14, 14, -1, 1, 'iron2');
      box(d, -4, -4, 12, 13, 0, 0, 'iron3');
      box(d, 4, 5, 12, 13, 0, 0, 'iron3');
      d.set(0, 15, 0, 'iron3');
      d.set(0, -4, 0, 'gold');
      break;
    case 'dagger':
      box(d, 0, 0, -1, 0, 0, 0, 'leather');
      box(d, -1, 1, 1, 1, 0, 0, 'gold');
      box(d, 0, 0, 2, 6, 0, 0, 'steel');
      d.set(0, 7, 0, 'steel2');
      d.set(0, -2, 0, 'gold');
      break;
    case 'spear':
      box(d, 0, 0, -8, 17, 0, 0, 'wood');
      for (const y of [-1, 0, 1, 16]) d.set(0, y, 0, 'leather');
      box(d, -1, 1, 18, 20, 0, 0, 'steel');
      box(d, 0, 0, 21, 23, 0, 0, 'steel');
      d.set(0, 24, 0, 'steel2');
      d.set(0, 18, 1, 'cloth_r'); d.set(0, 17, 1, 'cloth_r');
      break;
    default:                                              // chipped sword
      box(d, 0, 0, -1, 1, 0, 0, 'leather');
      d.set(0, -2, 0, 'gold');
      box(d, -2, 2, 2, 2, 0, 0, 'iron2');
      d.set(-2, 3, 0, 'iron2'); d.set(2, 3, 0, 'iron2');
      box(d, 0, 0, 3, 12, 0, 0, 'steel');
      box(d, 0, 0, 4, 10, 1, 1, 'steel2');
      d.set(0, 13, 0, 'steel2');
      d.delete(0, 9, 1);                                  // the chip
  }
  return d;
}

// =============================================================================
// Props (character grid, origin = floor centre)
// =============================================================================
// Wooden (or iron) chest, 11 x 6(+3 lid) x 7. Returns [body, lid]; lid pivot (0.5, 6, -3).
export function chestVox(iron) {
  const body = new Vox(), lid = new Vox();
  const a = iron ? 'iron' : 'plank';
  const a2 = iron ? 'iron3' : 'wood';
  const band = iron ? 'gold2' : 'iron';
  box(body, -5, 5, 0, 5, -3, 3, a);
  for (let x = -5; x <= 5; x++)
    for (let y = 0; y <= 5; y++)
      if (y % 2 === 1) { body.set(x, y, 3, a2); body.set(x, y, -3, a2); }
  for (const x of [-4, 4]) box(body, x, x, 0, 5, -3, 3, band);
  box(body, -5, 5, 0, 0, -3, 3, a2);
  box(lid, -5, 5, 6, 7, -3, 3, a);
  box(lid, -4, 4, 8, 8, -2, 2, a);
  for (const x of [-4, 4]) box(lid, x, x, 6, 8, -3, 3, band);
  box(lid, -5, 5, 6, 6, 3, 3, a2);
  box(lid, -1, 1, 5, 6, 4, 4, 'gold');                   // lock plate
  lid.set(0, 5, 4, 'gold2');
  if (iron) for (const x of [-2, 2]) body.set(x, 3, 4, 'gold');
  return [body, lid];
}

export function propVox(kind, variant = 0) {
  const d = new Vox();
  const rng = new Rng(strHash(kind) + variant * 977);
  switch (kind) {
    case 'sarcophagus':                                    // 12 x 11 x 26, lid with a carved knight
      box(d, -6, 5, 0, 1, -13, 12, 'st3');
      box(d, -5, 4, 2, 8, -12, 11, 'st1');
      for (let x = -5; x < 5; x++)
        for (let z = -12; z < 12; z++)
          for (let y = 2; y < 9; y++)
            if ((x === -5 || x === 4 || z === -12 || z === 11) && (y === 5 || (y > 2 && (x + z) % 6 === 0))) d.set(x, y, z, 'st2');
      box(d, -6, 5, 9, 10, -13, 12, 'st4');
      box(d, -5, 4, 10, 10, -12, 11, 'st1');
      box(d, -2, 1, 11, 11, 6, 9, 'st4');
      box(d, -3, 2, 11, 11, -6, 5, 'st4');
      box(d, -2, 1, 11, 11, -10, -7, 'st4');
      box(d, -1, 0, 12, 12, -9, 4, 'st2');
      box(d, -2, 1, 12, 12, 3, 3, 'st2');
      d.set(-1, 12, 8, 'st2'); d.set(0, 12, 8, 'st2');
      break;
    case 'statue':                                         // hooded warden, 29 tall, holds a sword point-down
      box(d, -6, 6, 0, 3, -5, 5, 'st3');
      box(d, -5, 5, 4, 4, -4, 4, 'st2');
      for (let y = 5; y < 23; y++) {
        const r = 4.2 - (y - 5) * 0.08;
        for (let x = -5; x <= 5; x++)
          for (let z = -4; z <= 4; z++)
            if (Math.hypot(x / r, z / (r * 0.75)) <= 1.0) d.set(x, y, z, (x + y) % 7 ? 'st1' : 'st2');
      }
      for (let y = 5; y < 22; y++)                        // robe folds
        for (const x of [-3, 0, 3]) if (d.has(x, y, 3)) d.set(x, y, 3, 'st2');
      box(d, -3, 3, 22, 28, -3, 3, 'st1');                // hood
      box(d, -2, 2, 23, 26, 3, 3, 'socket');              // dark face
      d.set(-1, 25, 3, 'eye_g2'); d.set(1, 25, 3, 'eye_g2');
      box(d, -2, 2, 29, 29, -2, 2, 'st1');
      box(d, -3, 3, 15, 16, 4, 5, 'st4');                 // hands
      box(d, 0, 0, 6, 20, 6, 6, 'st4');                   // sword, point down
      box(d, -2, 2, 17, 17, 6, 6, 'st4');
      d.set(0, 21, 6, 'st2');
      break;
    case 'pedestal':                                       // 12 tall column with a glowing rim
      box(d, -5, 5, 0, 1, -5, 5, 'st3');
      box(d, -4, 4, 2, 2, -4, 4, 'st2');
      box(d, -3, 3, 3, 9, -3, 3, 'st1');
      for (let y = 3; y < 10; y++)
        for (const [cx, cz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) d.set(cx, y, cz, 'st2');
      box(d, -5, 5, 10, 11, -5, 5, 'st4');
      for (let x = -5; x <= 5; x++)
        for (let z = -5; z <= 5; z++)
          if (Math.abs(x) === 5 || Math.abs(z) === 5) d.set(x, 11, z, 'rune');
      break;
    case 'barrel':                                         // 8 wide, 11 tall, bulging staves, and two hoops
      for (let y = 0; y < 11; y++) {
        const r = 3.6 + 0.6 * Math.sin(Math.PI * y / 10.0);
        for (let x = -5; x <= 5; x++)
          for (let z = -5; z <= 5; z++)
            if (Math.hypot(x, z) <= r) {
              const stave = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 12.0);
              d.set(x, y, z, stave % 2 ? 'wood' : 'wood2');
            }
        if (y === 2 || y === 8) {
          for (let x = -5; x <= 5; x++)
            for (let z = -5; z <= 5; z++) {
              const l = Math.hypot(x, z);
              if (l <= r + 0.5 && l > r - 1.0) d.set(x, y, z, 'iron');
            }
        }
      }
      for (let x = -3; x <= 3; x++)
        for (let z = -3; z <= 3; z++) if (Math.hypot(x, z) <= 3.2) d.set(x, 10, z, 'plank');
      break;
    case 'skull':
      box(d, -1, 1, 0, 2, -1, 1, 'bone');
      box(d, -1, 1, 0, 0, -1, 1, 'bone2');
      d.set(-1, 1, 2, 'socket'); d.set(1, 1, 2, 'socket');
      d.set(0, 1, 2, 'bone'); d.set(0, 0, 2, 'teeth');
      d.set(0, 3, 0, 'bone2');
      break;
    case 'bones': {
      for (let i = 0; i < 3 + variant; i++) {
        const a = rng.randf() * Math.PI * 2;
        const c = [rng.range(-3, 3), 0.5, rng.range(-3, 3)];
        const dir = [Math.cos(a), 0, Math.sin(a)];
        line(d, [c[0] - dir[0] * 2.5, c[1], c[2] - dir[2] * 2.5], [c[0] + dir[0] * 2.5, c[1], c[2] + dir[2] * 2.5], 'bone');
        for (const e of [-1, 1]) {
          const kx = Math.floor(c[0] + dir[0] * 2.8 * e), kz = Math.floor(c[2] + dir[2] * 2.8 * e);
          d.set(kx, 0, kz, 'bone2');
          d.set(kx + 1, 0, kz, 'bone2');
        }
      }
      box(d, 2, 4, 0, 2, 1, 3, 'bone');
      d.set(2, 1, 4, 'socket'); d.set(4, 1, 4, 'socket'); d.set(3, 0, 4, 'teeth');
      break;
    }
    case 'debris': {
      for (let i = 0; i < 5 + variant; i++) {
        const cx = rng.int(-6, 6), cz = rng.int(-6, 6);
        const sx = rng.int(1, 3), sy = rng.int(1, 3), sz = rng.int(1, 3);
        box(d, cx, cx + sx - 1, 0, sy - 1, cz, cz + sz - 1, ['st1', 'st2', 'st3'][i % 3]);
      }
      for (let i = 0; i < 6; i++) d.set(rng.int(-7, 7), 0, rng.int(-7, 7), 'st2');
      break;
    }
    case 'candle': {
      const hts = [5, 3, 4];
      const offs = [[0, 0], [2, 1], [-1, 2]];
      for (let i = 0; i < 1 + variant % 3; i++) {
        const [ox, oz] = offs[i];
        box(d, ox, ox, 0, hts[i] - 1, oz, oz, 'wax');
        d.set(ox, 0, oz + 1, 'wax2');
      }
      break;
    }
    case 'fire_pit':                                       // stone ring 17 wide; coals; flames are a separate glowing part
      for (let x = -8; x <= 8; x++)
        for (let z = -8; z <= 8; z++) {
          const l = Math.hypot(x, z);
          if (l <= 8.4) {
            if (l > 5.5) {
              for (let y = 0; y < 4 + ((x + z) % 3 === 0 ? 1 : 0); y++) d.set(x, y, z, (x * 3 + z) % 4 ? 'st1' : 'st2');
            } else {
              d.set(x, 0, z, 'st3');
              if (l < 4.5) d.set(x, 1, z, hash3(x, 1, z) > 0.35 ? 'coal' : 'ember');
            }
          }
        }
      break;
    case 'torch':                                          // wall bracket; flame is separate
      box(d, -1, 1, -1, 1, -2, -2, 'iron3');               // wall plate
      box(d, 0, 0, 0, 0, -1, 1, 'iron');                   // arm
      box(d, -1, 1, 0, 0, 1, 3, 'iron2');                  // cup ring
      d.delete(0, 0, 2);
      for (let i = 0; i < 5; i++) d.set(0, -3 + i, 2, i % 2 ? 'wood2' : 'wood');
      box(d, -1, 1, 1, 1, 1, 3, 'wood3');
      break;
  }
  return d;
}

// The portcullis that seals the room (w, h in character voxels).
export function gateVox(w, h) {
  const d = new Vox();
  const hw = Math.trunc(w / 2);
  for (let x = -hw; x <= hw; x++) {
    if (((x + hw) % 3 + 3) % 3 === 1) {
      box(d, x, x, 0, h - 1, 0, 0, 'iron');
      d.set(x, h, 0, 'iron2');
      d.set(x, 0, 0, 'iron3');
    }
  }
  for (const y of [4, Math.trunc(h / 2), h - 2]) {
    box(d, -hw, hw, y, y, -1, 0, 'iron3');
    for (let x = -hw; x <= hw; x += 4) d.set(x, y, 1, 'iron2');
  }
  return d;
}

// Diamond pyramid of glowing voxels (flames). cols = [outer, inner].
export function flameVox(cols, h, w) {
  const d = new Vox();
  for (let y = 0; y < h; y++) {
    const r = w - Math.trunc(y * w / h);
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++)
        if (Math.abs(x) + Math.abs(z) <= r)
          d.set(x, y, z, ((Math.abs(x) + Math.abs(z) < r || y >= h - 1) && y < h - 1) ? cols[1] : cols[0]);
  }
  d.set(0, h, 0, cols[0]);
  return d;
}
