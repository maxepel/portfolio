// VFX: everything is cubes. Cube bursts (hit, death, dust, gold, pickup, heal, slam),
// the swing arc as a stepped band of tiles, and the boss slam telegraph ring on the
// 25 cm floor grid (the fill reaching the rim marks the moment the slam lands).
import * as THREE from 'three';
import { CV } from './models.js';
import { V } from './world.js';
import { clamp, randf, randRange } from './util.js';

const MAX = 1800;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Godot scale curve (1 -> 0.85 at 60% -> 0) with flat tangents
function scaleCurve(t) {
  const sm = (x) => x * x * (3 - 2 * x);
  return t < 0.6 ? 1 + (0.85 - 1) * sm(t / 0.6) : 0.85 * (1 - sm((t - 0.6) / 0.4));
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.lit = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.glow = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), fog: false }), MAX);
    for (const m of [this.lit, this.glow]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.p = [];            // live cube particles
    this.timed = [];        // slash / telegraph objects with an update(dt) -> keep?
    this.dangerColor = new THREE.Color(0xff3b30);
    // Never drawn: keeps the translucent tile shader compiled so the first swing or slam does not hitch.
    const warm = this.tiles([], 0.1, 0.1, this.dangerColor, 0.5, 1);
    warm.count = 0;
    scene.add(warm);
  }

  // Cone burst of cubes. dir/spread (deg) define the cone; flat = emit in the XZ plane.
  cubes(pos, o) {
    const { amount, color, size, vmin, vmax, life, dir = [0, 1, 0], spread = 60, gravity = 0, emissive = false, flat = false } = o;
    const c = new THREE.Color(color);
    const cosMax = Math.cos((spread * Math.PI) / 180);
    const d = new THREE.Vector3(...dir).normalize();
    const a = Math.abs(d.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(d, a).normalize();
    const w = new THREE.Vector3().crossVectors(d, u);
    for (let i = 0; i < amount && this.p.length < MAX; i++) {
      let v;
      if (flat) {
        const ang = randf() * Math.PI * 2;
        v = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      } else {
        const cz = cosMax + (1 - cosMax) * randf();
        const sz = Math.sqrt(1 - cz * cz), ph = randf() * Math.PI * 2;
        v = d.clone().multiplyScalar(cz).addScaledVector(u, sz * Math.cos(ph)).addScaledVector(w, sz * Math.sin(ph));
      }
      const sp = randRange(vmin, vmax);
      this.p.push({
        x: pos.x, y: pos.y, z: pos.z, vx: v.x * sp, vy: v.y * sp, vz: v.z * sp,
        t: -randf() * life * 0.05, life, g: gravity, size: size * randRange(0.7, 1.3),
        ang: randf() * Math.PI / 2, av: randRange(-Math.PI, Math.PI), c, emissive,
      });
    }
  }

  spawn(kind, pos, params = {}) {
    switch (kind) {
      case 'hit':
        this.cubes(pos, { amount: 14, color: params.color ?? 0xffe699, size: CV * 0.8, vmin: 2.5, vmax: 5.5, life: 0.35, dir: [0, 1, 0], spread: 80, gravity: -12, emissive: true });
        break;
      case 'dodge_dust':
        this.cubes(pos, { amount: 10, color: 0x8a8478, size: CV * 1.4, vmin: 0.6, vmax: 1.6, life: 0.45, dir: [0, 0.4, 0], spread: 90 });
        break;
      case 'death': {
        const s = params.size ?? 0.4;
        this.cubes(pos, { amount: Math.floor(16 + s * 24), color: params.color ?? 0xb3b3b3, size: CV * (1.2 + s), vmin: 1.5, vmax: 3.5, life: 0.8, dir: [0, 1, 0], spread: 65, gravity: -9.8 });
        break;
      }
      case 'gold':
        this.cubes(pos, { amount: 26, color: 0xffc44a, size: CV, vmin: 3.0, vmax: 5.0, life: 1.0, dir: [0, 1, 0], spread: 35, gravity: -9.8, emissive: true });
        break;
      case 'pickup':
        this.cubes(pos, { amount: 30, color: 0x5cf6ff, size: CV, vmin: 1.5, vmax: 3.5, life: 1.0, dir: [0, 1, 0], spread: 60, gravity: -1.0, emissive: true });
        break;
      case 'heal':
        this.cubes(pos, { amount: 18, color: 0x66ff80, size: CV, vmin: 0.8, vmax: 1.8, life: 0.9, dir: [0, 1, 0], spread: 30, gravity: 1.5, emissive: true });
        break;
      case 'slam': {
        const rad = params.radius ?? 2.5;
        const ring = new THREE.Vector3(pos.x, 0.15, pos.z);
        this.cubes(ring, { amount: Math.floor(rad * 26), color: 0xb8ae98, size: V * 0.7, vmin: rad * 2.0, vmax: rad * 2.6, life: 0.45, flat: true });
        this.cubes(pos, { amount: 24, color: 0x6a7286, size: V * 0.6, vmin: 3.0, vmax: 6.0, life: 0.8, dir: [0, 1, 0], spread: 40, gravity: -14 });
        break;
      }
      case 'slash': return this.slash(params.pos, params.dir, params.reach, params.arc);
      case 'telegraph': return this.ring(pos, params.radius ?? 2.5, params.duration ?? 0.6);
    }
    return null;
  }

  tiles(points, tile, h, color, alpha, emit) {
    const geo = new THREE.BoxGeometry(tile, h, tile);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color.r * emit, color.g * emit, color.b * emit), transparent: true, opacity: alpha, depthWrite: false, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, points.length));
    for (let i = 0; i < points.length; i++) {
      tmpM.makeTranslation(points[i][0], points[i][1], points[i][2]);
      mesh.setMatrixAt(i, tmpM);
    }
    mesh.count = points.length;
    mesh.frustumCulled = false;
    return mesh;
  }

  // Swing arc as a stepped band of 1/3-grid cubes that flashes and shrinks away.
  slash(pos, dir, reach, arc) {
    const root = new THREE.Group();
    const cellsMap = new Map();
    const yaw = Math.atan2(dir.x, dir.z);
    const step = CV * 1.5;
    let r = reach * 0.5;
    while (r <= reach + 0.01) {
      const n = Math.ceil(arc * r / step) + 1;
      for (let i = 0; i <= n; i++) {
        const a = yaw - arc * 0.5 + arc * i / n;
        const px = Math.sin(a) * r, pz = Math.cos(a) * r;
        const py = -0.35 + (r - reach * 0.5) * 0.15;
        cellsMap.set(`${Math.round(px / step)},${Math.round(pz / step)}`, [Math.round(px / step) * step, py, Math.round(pz / step) * step]);
      }
      r += step;
    }
    const mesh = this.tiles([...cellsMap.values()], step * 0.8, step * 0.5, new THREE.Color(0.85, 0.95, 1.0), 0.85, 1.6);
    root.add(mesh);
    root.position.copy(pos);
    this.scene.add(root);
    let t = 0;
    this.timed.push({
      update: (dt) => {
        t += dt;
        const k = clamp(t / 0.2, 0, 1);
        mesh.material.opacity = 0.85 * (1 - k);
        mesh.scale.set(1 + 0.06 * k, 1 - 0.8 * k, 1 + 0.06 * k);
        return t < 0.25;
      },
      dispose: () => { this.scene.remove(root); mesh.geometry.dispose(); mesh.material.dispose(); },
    });
    return root;
  }

  // Floor ring of 25 cm tiles (on the world grid) that fills from the centre outward.
  ring(pos, radius, duration) {
    const root = new THREE.Group();
    const rim = [], fill = [];
    const r = Math.ceil(radius / V) + 1;
    const cx = Math.floor(pos.x / V), cz = Math.floor(pos.z / V);
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        const wx = (x + 0.5) * V, wz = (z + 0.5) * V;
        const dd = Math.hypot(wx - pos.x, wz - pos.z);
        const local = [wx - pos.x, 0.07, wz - pos.z];
        if (Math.abs(dd - radius) < V * 0.62) rim.push(local);
        else if (dd < radius) fill.push([dd, local]);
      }
    }
    fill.sort((a, b) => a[0] - b[0]);
    const fpos = fill.map((f) => f[1]);
    const rimMesh = this.tiles(rim, V * 0.92, 0.06, this.dangerColor, 0.95, 2.2);
    const fillMesh = this.tiles(fpos, V * 0.86, 0.04, this.dangerColor, 0.45, 1.4);
    fillMesh.count = 0;
    root.add(rimMesh, fillMesh);
    root.position.set(pos.x, 0, pos.z);
    this.scene.add(root);
    const total = fpos.length;
    const obj = {
      t: 0, root,
      update: (dt) => {
        obj.t += dt;
        fillMesh.count = Math.floor(clamp(obj.t / Math.max(0.05, duration), 0, 1) * total);
        const ph = (obj.t % 0.24) / 0.24;
        rimMesh.scale.y = ph < 0.5 ? 1 + 2 * ph : 3 - 2 * ph;
        return obj.t < duration + 0.1 && !obj.dead;
      },
      dispose: () => { this.scene.remove(root); rimMesh.geometry.dispose(); fillMesh.geometry.dispose(); rimMesh.material.dispose(); fillMesh.material.dispose(); },
    };
    this.timed.push(obj);
    return obj;
  }

  free(obj) { if (obj) obj.dead = true; }

  update(dt) {
    let nl = 0, ng = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t >= p.life) { this.p.splice(i, 1); continue; }
    }
    for (const p of this.p) {
      if (p.t < 0) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03 && p.g < 0) { p.y = 0.03; p.vy *= -0.2; p.vx *= 0.6; p.vz *= 0.6; }
      p.ang += p.av * dt;
      const s = p.size * scaleCurve(p.t / p.life);
      tmpQ.setFromAxisAngle(UP, p.ang);
      tmpS.set(s, s, s);
      tmpP.set(p.x, p.y, p.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      const mesh = p.emissive ? this.glow : this.lit;
      const idx = p.emissive ? ng++ : nl++;
      mesh.setMatrixAt(idx, tmpM);
      mesh.setColorAt(idx, p.c);
    }
    this.lit.count = nl; this.glow.count = ng;
    this.lit.instanceMatrix.needsUpdate = true; this.glow.instanceMatrix.needsUpdate = true;
    if (this.lit.instanceColor) this.lit.instanceColor.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (!this.timed[i].update(dt)) { this.timed[i].dispose(); this.timed.splice(i, 1); }
    }
  }

  clear() {
    this.p.length = 0;
    for (const t of this.timed) t.dispose();
    this.timed.length = 0;
  }
}
