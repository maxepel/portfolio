// The room: voxel architecture on the 25 cm world grid, props on the 1/3 grid, flames
// with stepped flicker, and the warm/cool light rig. Port of VoxelStyle.geometry/prop/light.
import * as THREE from 'three';
import { Vox, box, hash3, Noise, meshVox, toGeometries } from './vox.js';
import { PAL, COLORS } from './palette.js';
import { CV, propVox, chestVox, gateVox, flameVox, weapon as weaponVox } from './models.js';
import { SHARED, flameMaterial } from './materials.js';
import { meshesFor } from './character.js';
import { randf } from './util.js';

export const V = 0.25;
export const WALL_T = 1.6, WALL_H = 3.6, PARAPET_H = 0.9, DOOR_W = 2.3;
const SHIFT = [-0.5 * CV, 0, -0.5 * CV];
const PI = Math.PI;

// cells whose centre lies inside [lo, hi]
const cells = (lo, hi) => [Math.ceil(lo / V - 0.5), Math.floor(hi / V - 0.5)];

// --- Architecture voxelisers (world coordinates, so seams line up between pieces) ---
function floorVox(d, cx, cz, noise) {
  for (let x = cx[0]; x <= cx[1]; x++) {
    for (let z = cz[0]; z <= cz[1]; z++) {
      d.set(x, -2, z, 'fld');
      // staggered 2x2 flagstones
      const row = Math.floor(z / 2);
      const sx = Math.floor((x + (row & 1)) / 2);
      const hsh = hash3(sx, 0, row, 1);
      let nm = ['fl1', 'fl2', 'fl3', 'fl4'][Math.floor(hsh * 3.99)];
      const nv = noise.get2(x * 0.09, z * 0.09);
      if (hash3(x, 1, z, 6) > 0.965) nm = 'fld';
      if (nv > 0.55 && hash3(x, 2, z, 8) > 0.5) nm = 'lichen';
      d.set(x, -1, z, nm);
    }
  }
}

function wallVox(d, cx, cy, cz, noise) {
  for (let x = cx[0]; x <= cx[1]; x++) {
    for (let y = cy[0]; y <= cy[1]; y++) {
      for (let z = cz[0]; z <= cz[1]; z++) {
        const brick = Math.floor((x + z + (y & 1)) / 2);
        const h = hash3(brick, y, 0, 3);
        let nm = h < 0.4 ? 'wl1' : (h < 0.78 ? 'wl2' : 'wl3');
        if (y === cy[0]) nm = 'wld';
        else if (y === cy[1] && cy[1] - cy[0] > 4) nm = 'wt2';
        if (noise.get3(x * 0.12, y * 0.12, z * 0.12) > 0.5) nm = 'lichen';
        d.set(x, y, z, nm);
      }
    }
  }
  if (cy[1] - cy[0] > 6) {                       // a few recessed bricks (shadowed holes) for relief
    const n = Math.floor((cx[1] - cx[0] + 1) * (cz[1] - cz[0] + 1) * 0.02) + 2;
    for (let i = 0; i < n; i++) {
      const x = cx[0] + Math.floor(hash3(i, 1, cx[0], 11) * (cx[1] - cx[0] + 1));
      const z = cz[0] + Math.floor(hash3(i, 2, cz[0], 11) * (cz[1] - cz[0] + 1));
      const y = cy[0] + 2 + Math.floor(hash3(i, 3, cy[0], 11) * (cy[1] - cy[0] - 3));
      d.delete(x, y, z);
    }
  }
}

function pillarVox(d, cx, cy, cz) {
  const stump = cy[1] - cy[0] < 8;
  for (let x = cx[0]; x <= cx[1]; x++) {
    for (let z = cz[0]; z <= cz[1]; z++) {
      let top = cy[1];
      if (stump && hash3(x, 0, z, 13) > 0.45) top -= 1 + Math.floor(hash3(x, 1, z, 13) * 2.0);
      for (let y = cy[0]; y <= top; y++) {
        const edge = (x === cx[0] || x === cx[1]) && (z === cz[0] || z === cz[1]);
        let nm = edge ? 'pl2' : 'pl1';
        if (y === cy[0]) nm = 'wld';
        else if (y === cy[1] && !stump) nm = 'wt1';
        else if ((y - cy[0]) % 4 === 0) nm = 'pl2';
        d.set(x, y, z, nm);
      }
    }
  }
}

function wallTopVox(d, cx, cy, cz) {
  for (let x = cx[0]; x <= cx[1]; x++)
    for (let z = cz[0]; z <= cz[1]; z++)
      d.set(x, cy[0], z, hash3(Math.trunc(x / 2), 0, Math.trunc(z / 2), 2) > 0.5 ? 'wt1' : 'wt2');
}

// Add one architecture piece (centre, size in metres) to the merged parts.
export function addPiece(parts, kind, center, size, noises) {
  const cx = cells(center[0] - size[0] / 2, center[0] + size[0] / 2);
  const cy = cells(center[1] - size[1] / 2, center[1] + size[1] / 2);
  const cz = cells(center[2] - size[2] / 2, center[2] + size[2] / 2);
  const d = new Vox();
  if (kind === 'floor') floorVox(d, cx, cz, noises.floor);
  else if (kind === 'pillar') pillarVox(d, cx, cy, cz);
  else if (kind === 'wall_top') wallTopVox(d, cx, cy, cz);
  else wallVox(d, cx, cy, cz, noises.wall);
  meshVox(d, PAL, V, [0, 0, 0], parts);
}

function stairsVox(size) {
  const hw = Math.round(size[0] / V / 2.0 - 0.5);
  const nz = Math.round(size[2] / V);
  const steps = Math.round(size[1] / V);
  const d = new Vox();
  for (let z = 0; z < nz; z++) {
    const step = Math.trunc(z * steps / nz);
    for (let x = -hw; x <= hw; x++) {
      for (let y = -steps - 1; y < -step; y++) {
        let nm = (x + z) % 3 ? 'st1' : 'st2';
        if (y === -step - 1) nm = (Math.trunc(z * steps / nz) === step && Math.trunc((z + 1) * steps / nz) !== step) ? 'wt1' : nm;
        d.set(x, y, z, nm);
      }
    }
  }
  return { d, nz };
}

// --- Props on the 1/3 grid ----------------------------------------------------------
const propCache = {};
export function propGeoms(kind, variant = 0) {
  const k = `${kind}|${variant}`;
  if (!propCache[k]) propCache[k] = toGeometries(meshVox(propVox(kind, variant), PAL, CV, SHIFT));
  return propCache[k];
}

const weaponCache = {};
export function weaponGeoms(id) {
  if (!weaponCache[id]) weaponCache[id] = toGeometries(meshVox(weaponVox(id), PAL, CV, SHIFT));
  return weaponCache[id];
}

const chestCache = {};
function chestGeoms(iron) {
  const k = iron ? 'iron' : 'wood';
  if (!chestCache[k]) {
    const [body, lid] = chestVox(iron);
    const piv = [0.5, 6, -3];
    chestCache[k] = {
      body: toGeometries(meshVox(body, PAL, CV, SHIFT)),
      lid: toGeometries(meshVox(lid, PAL, CV, [-piv[0] * CV, -piv[1] * CV, -piv[2] * CV])),
    };
  }
  return chestCache[k];
}

const flameGeomCache = {};
function flameGeoms(key, vox, pivotCells) {
  if (!flameGeomCache[key]) flameGeomCache[key] = toGeometries(meshVox(vox, PAL, CV, [-pivotCells[0] * CV, -pivotCells[1] * CV, -pivotCells[2] * CV]));
  return flameGeomCache[key];
}

// Stepped flicker: snaps between four scales (voxel animation is 8-12 fps).
const FLICKER = [[1, 1.15, 1], [1.1, 0.9, 1.1], [0.95, 1.05, 0.95], [1, 1, 1]];

// Registry the level ticks each frame: flames (stepped flicker) and tracked lights.
export class Flicker {
  constructor() { this.flames = []; this.lights = []; }
  flame(parent, key, vox, pos, pivotCells, energy = 4) {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    const mat = flameMaterial(energy);
    const geoms = flameGeoms(key, vox, pivotCells);
    for (const c in geoms) {
      const m = new THREE.Mesh(geoms[c], mat);
      g.add(m);
    }
    parent.add(g);
    this.flames.push({ g, mat, phase: randf() * 20, t: randf() * 0.3, idx: 0 });
    return g;
  }
  trackLight(light, flicker) {
    this.lights.push({ light, base: light.intensity, flicker, seed: randf() * 10 });
    return light;
  }
  update(dt, time) {
    for (const f of this.flames) {
      f.t -= dt;
      if (f.t <= 0) {
        f.idx = (f.idx + 1) % 4;
        const s = FLICKER[f.idx];
        f.g.scale.set(s[0], s[1], s[2]);
        f.t = 0.09 + randf() * 0.05;
      }
      const k = 1 - (0.5 + 0.5 * Math.sin(time * 13 + f.phase)) * 0.35;
      f.mat.color.setScalar(f.mat.userData.energy * k);
    }
    for (const l of this.lights) {
      let e = l.base;
      if (l.flicker) e *= 0.86 + 0.1 * Math.sin(time * 9.1 + l.seed) + 0.06 * Math.sin(time * 23.7 + l.seed * 2.0);
      l.light.intensity = e * (l.scale ?? 1);
    }
  }
}

const FL = ['flame_g', 'flame_g2'];   // crypts spirit flames

export function omni(color, energy, range, K = 1) {
  const l = new THREE.PointLight(color, energy * PI * K, range, 0.8);
  return l;
}

// A dressing prop, origin on the floor, facing +Z.
export function makeProp(kind, fx, params = {}) {
  const n = new THREE.Group();
  n.name = kind;
  switch (kind) {
    case 'torch': {
      n.add(meshesFor(propGeoms('torch', 0), SHARED));
      fx.flame(n, 'torch_flame', flameVox(FL, 5, 1), [-0.5 * CV, 2 * CV, 1.5 * CV], [-0.5, 0, -0.5]);
      break;
    }
    case 'candle': {
      const v = Math.floor(Math.random() * 3);
      n.add(meshesFor(propGeoms('candle', v), SHARED));
      const hts = [5, 3, 4];
      const offs = [[0, 0], [2, 1], [-1, 2]];
      for (let i = 0; i < 1 + v; i++) {
        const fv = new Vox();
        fv.set(0, 0, 0, 'flame_c'); fv.set(0, 1, 0, 'flame_c2');
        fx.flame(n, 'candle_flame', fv, [offs[i][0] * CV + SHIFT[0], hts[i] * CV, offs[i][1] * CV + SHIFT[2]], [-0.5, 0, -0.5]);
      }
      break;
    }
    case 'chest': case 'chest_iron': {
      const iron = kind === 'chest_iron';
      const c = chestGeoms(iron);
      n.add(meshesFor(c.body, SHARED));
      const lid = new THREE.Group();
      lid.name = 'Lid';
      lid.rotation.order = 'YXZ';
      lid.position.set(0, 6 * CV, -3.5 * CV);
      lid.add(meshesFor(c.lid, SHARED));
      n.add(lid);
      n.userData.lid = lid;
      break;
    }
    case 'sarcophagus': case 'statue': case 'pedestal': case 'barrel': case 'crate': case 'skull':
      n.add(meshesFor(propGeoms(kind, 0), SHARED));
      break;
    case 'bones': case 'debris':
      n.add(meshesFor(propGeoms(kind, Math.floor(Math.random() * 3)), SHARED));
      break;
    case 'fire_pit': {
      n.add(meshesFor(propGeoms('fire_pit', 0), SHARED));
      const fv = new Vox();
      for (let i = 0; i < 7; i++) {
        const a = i * (PI * 2) / 7.0;
        const px = Math.round(Math.cos(a) * 2.2), pz = Math.round(Math.sin(a) * 2.2);
        const h = 3 + (i % 3);
        for (let y = 0; y < h; y++) fv.set(px, y, pz, y < h - 2 ? FL[1] : FL[0]);
      }
      for (let y = 0; y < 7; y++) {
        fv.set(0, y, 0, y < 5 ? FL[1] : FL[0]);
        if (y < 4) { fv.set(1, y, 0, FL[1]); fv.set(0, y, 1, FL[1]); }
      }
      fx.flame(n, 'pit_flame', fv, [SHIFT[0], 2 * CV, SHIFT[2]], [-0.5, 0, -0.5], 3);
      const l = fx.trackLight(omni(COLORS.torch, 1.6, 6.0, 0.55), true);
      l.position.set(0, 0.9, 0);
      n.add(l);
      break;
    }
    case 'stairs': {
      const size = params.size || [DOOR_W, 1.0, 2.6];
      const { d, nz } = stairsVox(size);
      const g = toGeometries(meshVox(d, PAL, V, [-0.5 * V, 0, -nz / 2.0 * V]));
      n.add(meshesFor(g, SHARED));
      break;
    }
    case 'door': {
      const size = params.size || [DOOR_W, 2.2, 0.3];
      const w = Math.trunc(size[0] / CV), h = Math.trunc(size[1] / CV);
      n.add(meshesFor(toGeometries(meshVox(gateVox(w, h), PAL, CV, SHIFT)), SHARED));
      break;
    }
    case 'item_warhammer': case 'item_daggers': case 'item_spear': {
      const id = kind.slice(5);
      if (id === 'daggers') {
        for (const s of [-1, 1]) {
          const m = meshesFor(weaponGeoms('dagger'), SHARED);
          m.position.set(s * 0.14, -0.25, 0);
          m.rotation.z = s * 0.35;
          n.add(m);
        }
      } else {
        const m = meshesFor(weaponGeoms(id), SHARED);
        m.position.set(0, id === 'spear' ? -0.7 : -0.5, 0);
        m.rotation.z = 0.3;
        n.add(m);
      }
      break;
    }
    default: {
      const d = new Vox();
      box(d, -3, 2, 0, 5, -3, 2, 'st2');
      n.add(meshesFor(toGeometries(meshVox(d, PAL, CV, [0, 0, 0])), SHARED));
    }
  }
  return n;
}

// --- The room -----------------------------------------------------------------------
// Builds architecture, dressing, and lights into `scene`. Returns what the game needs.
export function buildRoom(scene, lay, fx) {
  const half = lay.half;
  const doorX = lay.door_x;
  const noises = { floor: new Noise(7), wall: new Noise(3) };
  const solids = [];        // XZ boxes {x, z, hx, hz} (hero and foes slide along them)
  const solid = (pos, size) => { const s = { x: pos[0], z: pos[2], hx: size[0] / 2, hz: size[2] / 2 }; solids.push(s); return s; };
  const parts = {};
  const piece = (kind, size, pos, collide = true) => {
    addPiece(parts, kind, pos, size, noises);
    if (collide) solid(pos, size);
  };
  const fw = half[0] * 2 + WALL_T * 2;
  const fd = half[1] * 2 + WALL_T * 2;
  piece('floor', [fw, 0.2, fd], [0, -0.1, 0], false);
  const h = WALL_H;
  piece('wall', [fw, h, WALL_T], [0, h / 2, -half[1] - WALL_T / 2]);
  piece('wall', [WALL_T, h, half[1] * 2], [-half[0] - WALL_T / 2, h / 2, 0]);
  piece('wall', [WALL_T, h, half[1] * 2], [half[0] + WALL_T / 2, h / 2, 0]);
  // Front: a low parapet so the camera sees in, split by the exit door.
  const lw = (doorX - DOOR_W / 2) - (-half[0] - WALL_T);
  const rw = (half[0] + WALL_T) - (doorX + DOOR_W / 2);
  piece('wall', [lw, PARAPET_H, WALL_T], [-half[0] - WALL_T + lw / 2, PARAPET_H / 2, half[1] + WALL_T / 2]);
  piece('wall', [rw, PARAPET_H, WALL_T], [doorX + DOOR_W / 2 + rw / 2, PARAPET_H / 2, half[1] + WALL_T / 2]);
  piece('wall_top', [fw + 0.2, 0.18, WALL_T + 0.2], [0, h + 0.09, -half[1] - WALL_T / 2], false);
  for (const sx of [-1, 1]) piece('wall_top', [WALL_T + 0.2, 0.18, half[1] * 2], [sx * (half[0] + WALL_T / 2), h + 0.09, 0], false);
  // Keep the floor beyond the door from being walkable sideways.
  for (const sx of [-1, 1]) solid([doorX + sx * (DOOR_W / 2 + 0.5), 1.0, half[1] + WALL_T + 1.5], [1.0, 2.0, 3.0]);
  solid([doorX, 1.0, half[1] + WALL_T + 3.2], [DOOR_W + 2.0, 2.0, 0.6]);
  // Pillars.
  const ph = h;
  for (const [px, pz] of lay.pillars) piece('pillar', [0.9, ph, 0.9], [px, ph / 2, pz]);
  const geoms = toGeometries(parts);
  const room = meshesFor(geoms, SHARED);
  room.name = 'room';
  scene.add(room);
  // Exit stairs and the gate that seals the room.
  const stairs = makeProp('stairs', fx, { size: [DOOR_W, 1.0, 2.6] });
  stairs.position.set(doorX, 0, half[1] + WALL_T + 1.3);
  scene.add(stairs);
  const gate = makeProp('door', fx, { size: [DOOR_W, 2.3, 0.3] });
  gate.position.set(doorX, 0, half[1] + 0.1);
  scene.add(gate);
  const gateSolid = { x: doorX, z: half[1] + 0.1, hx: DOOR_W / 2, hz: 0.2, gate: true, active: true };
  solids.push(gateSolid);
  // Dressing.
  for (const p of lay.props) {
    const n = makeProp(p.kind, fx);
    n.position.set(p.pos[0], p.pos[1], p.pos[2]);
    n.rotation.y = p.yaw || 0;
    scene.add(n);
    if (p.solid) solid(p.pos, p.solid);
  }
  for (const pos of lay.torches) {
    const t = makeProp('torch', fx);
    t.position.set(pos[0], pos[1], pos[2]);
    // Face into the room from whichever wall it hangs on.
    const side = Math.abs(pos[0]) > half[0] - 1.0;
    t.rotation.y = side ? Math.atan2(-Math.sign(pos[0]), 0.0) : (pos[2] < 0 ? 0.0 : PI);
    scene.add(t);
    const l = fx.trackLight(omni(COLORS.torch, 2.4, 8.0, 0.75), true);
    const off = side ? [-Math.sign(pos[0]) * 0.4, 0.2, 0] : [0, 0.2, 0.4];
    l.position.set(pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]);
    scene.add(l);
  }
  for (const pos of lay.candles) {
    const c = makeProp('candle', fx);
    c.position.set(pos[0], pos[1], pos[2]);
    scene.add(c);
  }
  // One cool key from above-left (moonlight through the grates) with shadows.
  const sun = new THREE.DirectionalLight(0x9fb4e8, 0.42 * PI);
  const dir = new THREE.Vector3(-0.281, -0.848, -0.449).normalize();
  sun.position.copy(dir.clone().multiplyScalar(-24));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -17; sc.right = 17; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.5;
  scene.add(sun);
  scene.add(sun.target);
  return { solids, gate, gateSolid, room, stairs, sun, half, doorX };
}
