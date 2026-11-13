// Voxel grid + mesher: a port of the Godot VoxMesh (culled + greedy faces, per-vertex
// AO baked into the vertex colour, 0fps rule, quad flipped to the brighter diagonal).
import * as THREE from 'three';

// Material classes. A mesh is split into one geometry per class.
export const SOLID = 0, WATER = 1, GLOW = 2, METAL = 3, JELLY = 4;
const AO_CURVE = [0.46, 0.66, 0.84, 1.0];
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const OFF = 1024, SPAN = 2048;

// Sparse voxel grid keyed by integer cell, values are palette entry names.
export class Vox {
  constructor() { this.m = new Map(); }
  static key(x, y, z) { return ((x + OFF) * SPAN + (y + OFF)) * SPAN + (z + OFF); }
  set(x, y, z, name) { this.m.set(Vox.key(x, y, z), name); }
  get(x, y, z) { return this.m.get(Vox.key(x, y, z)); }
  has(x, y, z) { return this.m.has(Vox.key(x, y, z)); }
  delete(x, y, z) { this.m.delete(Vox.key(x, y, z)); }
  get size() { return this.m.size; }
  forEach(fn) {
    for (const [k, name] of this.m) {
      const z = (k % SPAN) - OFF;
      const r = Math.floor(k / SPAN);
      const y = (r % SPAN) - OFF;
      const x = Math.floor(r / SPAN) - OFF;
      fn(x, y, z, name);
    }
  }
  keysArray() { const out = []; this.forEach((x, y, z) => out.push([x, y, z])); return out; }
}

// --- Painting helpers -----------------------------------------------------------
export function box(d, x0, x1, y0, y1, z0, z1, nm) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) d.set(x, y, z, nm);
}

export function ellipsoid(d, c, r, nm) {
  for (let x = Math.floor(c[0] - r[0]); x <= Math.ceil(c[0] + r[0]); x++)
    for (let y = Math.floor(c[1] - r[1]); y <= Math.ceil(c[1] + r[1]); y++)
      for (let z = Math.floor(c[2] - r[2]); z <= Math.ceil(c[2] + r[2]); z++) {
        const qx = (x + 0.5 - c[0]) / r[0], qy = (y + 0.5 - c[1]) / r[1], qz = (z + 0.5 - c[2]) / r[2];
        if (qx * qx + qy * qy + qz * qz <= 1.0) d.set(x, y, z, nm);
      }
}

export function line(d, a, b, nm, thick = 0) {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.ceil(dist * 2) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cx = Math.floor(a[0] + (b[0] - a[0]) * t);
    const cy = Math.floor(a[1] + (b[1] - a[1]) * t);
    const cz = Math.floor(a[2] + (b[2] - a[2]) * t);
    for (let ox = -thick; ox <= thick; ox++)
      for (let oz = -thick; oz <= thick; oz++) d.set(cx + ox, cy, cz + oz, nm);
  }
}

// Deterministic 0..1 hash of a cell (palette ramp picks without confetti).
export function hash3(x, y, z, k = 0) {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791) ^ Math.imul(k | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 65535;
}

// Small seeded gradient noise (stands in for FastNoiseLite); returns about -0.7..0.7.
export class Noise {
  constructor(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0 || 1;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static grad(h, x, y, z) {
    const u = (h & 15) < 8 ? x : y;
    const v = (h & 15) < 4 ? y : ((h & 15) === 12 || (h & 15) === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  get3(x, y, z) {
    const p = this.p;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = Noise.fade(x), v = Noise.fade(y), w = Noise.fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const L = THREE.MathUtils.lerp;
    return L(
      L(L(Noise.grad(p[AA], x, y, z), Noise.grad(p[BA], x - 1, y, z), u), L(Noise.grad(p[AB], x, y - 1, z), Noise.grad(p[BB], x - 1, y - 1, z), u), v),
      L(L(Noise.grad(p[AA + 1], x, y, z - 1), Noise.grad(p[BA + 1], x - 1, y, z - 1), u), L(Noise.grad(p[AB + 1], x, y - 1, z - 1), Noise.grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }
  get2(x, y) { return this.get3(x, y, 0.37); }
}

function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

// Palette entry: [r, g, b (sRGB 0..1), class]. Built from "rrggbb" strings.
export function makePalette(tables) {
  const out = {};
  for (const t of tables) {
    for (const k in t) {
      const hex = parseInt(t[k][0], 16);
      out[k] = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, t[k][1]];
    }
  }
  return out;
}

// Raw quad lists per class: {pos, nrm, col, idx} (plain arrays so pieces can be merged).
export function newParts() { return {}; }

function part(parts, c) {
  return parts[c] || (parts[c] = { pos: [], nrm: [], col: [], idx: [] });
}

// Mesh a Vox grid into `parts` (merging into an existing parts object if given).
// cell: edge length in metres; origin: [x, y, z] metres of cell (0,0,0)'s corner.
export function meshVox(vox, pal, cell, origin, parts = {}, greedy = true) {
  if (!vox.size) return parts;
  let mnx = 1 << 29, mny = 1 << 29, mnz = 1 << 29, mxx = -(1 << 29), mxy = -(1 << 29), mxz = -(1 << 29);
  vox.forEach((x, y, z) => {
    if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
    if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
  });
  const mn = [mnx, mny, mnz];
  const dims = [mxx - mnx + 3, mxy - mny + 3, mxz - mnz + 3];
  const [dx, dy, dz] = dims;
  const grid = new Int16Array(dx * dy * dz).fill(-1);
  const names = [], nameId = {}, cls = [], cols = [];
  vox.forEach((x, y, z, nm) => {
    let id = nameId[nm];
    if (id === undefined) {
      id = names.length; names.push(nm); nameId[nm] = id;
      const e = pal[nm] || [1, 0, 1, SOLID];
      cls.push(e[3]); cols.push([e[0], e[1], e[2]]);
    }
    grid[((x - mnx + 1) * dy + (y - mny + 1)) * dz + (z - mnz + 1)] = id;
  });
  // translucent cells don't darken their neighbours
  const occ = cls.map((c) => (c === WATER || c === JELLY ? 0 : 1));
  const translucent = (c) => c === WATER || c === JELLY;
  const strides = [dy * dz, dz, 1];
  for (let a = 0; a < 3; a++) {
    const ua = (a + 1) % 3, va = (a + 2) % 3;
    const na = dims[a], nu = dims[ua], nv = dims[va];
    const sa = strides[a], su = strides[ua], sv = strides[va];
    for (const s of [-1, 1]) {
      const nrm = [0, 0, 0]; nrm[a] = s;
      const ccw = s > 0;
      for (let i = 1; i < na - 1; i++) {
        const mask = new Int32Array(nu * nv).fill(-1);
        let any = false;
        for (let u = 1; u < nu - 1; u++) {
          for (let v = 1; v < nv - 1; v++) {
            const ci = i * sa + u * su + v * sv;
            const id = grid[ci];
            if (id < 0) continue;
            const ni = ci + s * sa;
            const nb = grid[ni];
            if (nb >= 0 && (!translucent(cls[nb]) || translucent(cls[id]))) continue;
            let key = id * 256;
            if (cls[id] !== GLOW) {
              let aos = 0;
              for (let k = 0; k < 4; k++) {
                const cu = CORNERS[k][0], cv = CORNERS[k][1];
                const g1 = grid[ni + cu * su], g2 = grid[ni + cv * sv], g3 = grid[ni + cu * su + cv * sv];
                const s1 = g1 >= 0 ? occ[g1] : 0, s2 = g2 >= 0 ? occ[g2] : 0, s3 = g3 >= 0 ? occ[g3] : 0;
                const ao = (s1 === 1 && s2 === 1) ? 0 : 3 - (s1 + s2 + s3);
                aos |= ao << (k * 2);
              }
              key += aos;
            } else {
              key += 255;
            }
            mask[u * nv + v] = key;
            any = true;
          }
        }
        if (!any) continue;
        for (let u = 1; u < nu - 1; u++) {
          let v = 1;
          while (v < nv - 1) {
            const key = mask[u * nv + v];
            if (key < 0) { v++; continue; }
            const aob = key & 255;
            const uniform = aob === 0 || aob === 85 || aob === 170 || aob === 255;
            let h = 1, w = 1;
            if (greedy && uniform) {
              while (v + h < nv - 1 && mask[u * nv + v + h] === key) h++;
              let ok = true;
              while (ok && u + w < nu - 1) {
                for (let t = 0; t < h; t++) {
                  if (mask[(u + w) * nv + v + t] !== key) { ok = false; break; }
                }
                if (ok) w++;
              }
            }
            for (let uu = 0; uu < w; uu++)
              for (let vv = 0; vv < h; vv++) mask[(u + uu) * nv + v + vv] = -1;
            const id = key >> 8;
            const P = part(parts, cls[id]);
            const start = P.pos.length / 3;
            const plane = i - 1 + mn[a] + (s > 0 ? 1 : 0);
            const u0 = u - 1 + mn[ua], v0 = v - 1 + mn[va];
            const base = cols[id];
            const aov = [aob & 3, (aob >> 2) & 3, (aob >> 4) & 3, (aob >> 6) & 3];
            for (let k = 0; k < 4; k++) {
              const p = [0, 0, 0];
              p[a] = plane;
              p[ua] = u0 + (CORNERS[k][0] > 0 ? w : 0);
              p[va] = v0 + (CORNERS[k][1] > 0 ? h : 0);
              P.pos.push(origin[0] + p[0] * cell, origin[1] + p[1] * cell, origin[2] + p[2] * cell);
              P.nrm.push(nrm[0], nrm[1], nrm[2]);
              const b = AO_CURVE[aov[k]];
              // AO in sRGB (as the Godot swatch), stored linear
              P.col.push(srgbToLinear(base[0] * b), srgbToLinear(base[1] * b), srgbToLinear(base[2] * b));
            }
            const tris = (aov[0] + aov[2] >= aov[1] + aov[3]) ? [0, 1, 2, 0, 2, 3] : [0, 1, 3, 1, 2, 3];
            for (let t = 0; t < 6; t += 3) {
              // Godot winds clockwise; three.js counter-clockwise
              if (ccw) P.idx.push(start + tris[t], start + tris[t + 1], start + tris[t + 2]);
              else P.idx.push(start + tris[t], start + tris[t + 2], start + tris[t + 1]);
            }
            v += h;
          }
        }
      }
    }
  }
  return parts;
}

// parts -> { [class]: BufferGeometry }
export function toGeometries(parts) {
  const out = {};
  for (const c in parts) {
    const P = parts[c];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
    g.setIndex(P.idx);
    g.computeBoundingSphere();
    out[c] = g;
  }
  return out;
}

// Convenience: mesh a grid straight to geometries.
export function buildGeometries(vox, pal, cell, origin) {
  return toGeometries(meshVox(vox, pal, cell, origin));
}
