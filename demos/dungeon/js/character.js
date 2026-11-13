// Actors: the KitCharacter contract (play / face / flash / anim_length), the rigid-part
// voxel characters (every enemy), and voxel Pip (skinned GLB + a voxel weapon on the arm).
import * as THREE from 'three';
import { clone as cloneSkinned } from './vendor/addons/utils/SkeletonUtils.js';
import { meshVox, toGeometries, SOLID } from './vox.js';
import { PAL } from './palette.js';
import { CV, character as characterModel, weapon as weaponVox } from './models.js';
import { actorMaterials } from './materials.js';
import { Tweener, lerp, lerpAngle, clamp, godotEase, sineInOut, backOut, bounceOut } from './util.js';

const DEFAULT_LEN = { idle: 1.0, walk: 0.8, attack: 0.4, hurt: 0.25, die: 0.7, windup: 0.6, rise: 0.9, dodge: 0.2 };
const LOOPING = ['idle', 'walk'];

// One Mesh per material class from a geometry map.
export function meshesFor(geoms, mats, shadow = true) {
  const g = new THREE.Group();
  for (const cls in geoms) {
    const m = new THREE.Mesh(geoms[cls], mats[cls] || mats[SOLID]);
    m.castShadow = shadow && Number(cls) !== 2;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export class KitCharacter {
  constructor(role) {
    this.root = new THREE.Group();          // the physics body positions/scales this
    this.pivot = new THREE.Group();         // rotated to face
    this.pose = new THREE.Group();          // procedural offsets (lunge / lean / fall) live here
    this.root.add(this.pivot);
    this.pivot.add(this.pose);
    this.role = role;
    this.height = 1.7;
    this.turnSpeed = 14;
    this.current = '';
    this.mats = actorMaterials();
    this._yaw = 0;
    this._animT = 0;
    this._animSpeed = 1;
    this._flashT = 0;
    this._flashLen = 0.12;
    this._flashColor = new THREE.Color(1, 1, 1);
    this.tw = new Tweener();
    this.ctw = new Tweener();
    this.timeOffset = Math.random() * 12.6;
  }

  get position() { return this.root.position; }

  play(anim, speed = 1.0) {
    if (anim === this.current && LOOPING.includes(anim)) return;
    this.current = anim;
    this._animT = 0;
    this._animSpeed = speed;
    const native = this.backendPlay(anim, speed);
    this.procPlay(anim, speed, native);
  }

  face(dir) {
    if (Math.hypot(dir.x, dir.z) > 0.01) this._yaw = Math.atan2(dir.x, dir.z);
  }

  faceNow(dir) {
    this.face(dir);
    this.pivot.rotation.y = this._yaw;
  }

  flash(color = new THREE.Color(1, 1, 1), time = 0.12) {
    this._flashT = time;
    this._flashLen = Math.max(0.01, time);
    this._flashColor.copy(color);
  }

  animLength(anim) { return DEFAULT_LEN[anim] ?? 0.5; }
  animDone() { return this._animT >= this.animLength(this.current); }
  hasNative() { return false; }
  backendPlay() { return false; }
  tick() {}

  update(dt) {
    this._animT += dt * this._animSpeed;
    this.pivot.rotation.y = lerpAngle(this.pivot.rotation.y, this._yaw, Math.min(1, dt * this.turnSpeed));
    if (this._flashT > 0 || this._flashing) {
      this._flashT = Math.max(0, this._flashT - dt);
      const a = clamp(this._flashT / this._flashLen, 0, 1) * 0.75;
      for (const m of this.mats.flashable) m.emissive.setRGB(this._flashColor.r * a, this._flashColor.g * a, this._flashColor.b * a);
      this._flashing = a > 0;
    }
    this.tw.update(dt);
    this.ctw.update(dt);
    this.tick(dt);
  }

  // Fakes the anims a backend lacks by tweening `pose` (lunge, lean, fall over, get up).
  procPlay(anim, speed, native) {
    const { pose, tw } = this;
    tw.clear();
    const s = Math.max(0.1, speed);
    if (native && anim !== 'rise') {
      tw.to(pose.rotation, 'x', 0, 0.08).to(pose.rotation, 'y', 0, 0.08).to(pose.rotation, 'z', 0, 0.08);
      tw.to(pose.position, 'x', 0, 0.08).to(pose.position, 'y', 0, 0.08).to(pose.position, 'z', 0, 0.08);
      tw.to(pose.scale, 'x', 1, 0.08).to(pose.scale, 'y', 1, 0.08).to(pose.scale, 'z', 1, 0.08);
      return;
    }
    switch (anim) {
      case 'attack': {
        const d = this.animLength('attack') / s;
        tw.to(pose.rotation, 'x', 0.35, d * 0.3).to(pose.position, 'z', 0.3, d * 0.3);
        tw.to(pose.rotation, 'x', 0, d * 0.7, undefined, d * 0.3).to(pose.position, 'z', 0, d * 0.7, undefined, d * 0.3);
        break;
      }
      case 'windup': {
        const d = this.animLength('windup') / s;
        tw.to(pose.rotation, 'x', -0.3, d * 0.8, sineInOut);
        tw.to(pose.scale, 'x', 1.08, d * 0.8, sineInOut).to(pose.scale, 'y', 1.08, d * 0.8, sineInOut).to(pose.scale, 'z', 1.08, d * 0.8, sineInOut);
        break;
      }
      case 'hurt':
        tw.to(pose.rotation, 'x', -0.35, 0.06);
        tw.to(pose.rotation, 'x', 0, 0.2, undefined, 0.06);
        break;
      case 'dodge':
        tw.to(pose.rotation, 'x', 0.5, 0.06);
        tw.to(pose.scale, 'x', 1.1, 0.06).to(pose.scale, 'y', 0.8, 0.06).to(pose.scale, 'z', 1.1, 0.06);
        tw.to(pose.rotation, 'x', 0, 0.16, undefined, 0.06);
        tw.to(pose.scale, 'x', 1, 0.16, undefined, 0.06).to(pose.scale, 'y', 1, 0.16, undefined, 0.06).to(pose.scale, 'z', 1, 0.16, undefined, 0.06);
        break;
      case 'die': {
        const d = this.animLength('die') / s;
        tw.to(pose.rotation, 'x', -Math.PI * 0.48, d, bounceOut);
        tw.to(pose.scale, 'x', 1, d * 0.5).to(pose.scale, 'y', 1, d * 0.5).to(pose.scale, 'z', 1, d * 0.5);
        break;
      }
      case 'rise': {
        const d = this.animLength('rise') / s;
        if (Math.abs(pose.rotation.x) < 0.1 && !native) {
          pose.rotation.x = -Math.PI * 0.48;
          pose.position.y = -this.height * 0.4;
        }
        tw.to(pose.rotation, 'x', 0, d, backOut);
        tw.to(pose.position, 'x', 0, d).to(pose.position, 'y', 0, d).to(pose.position, 'z', 0, d);
        break;
      }
      default:
        tw.to(pose.rotation, 'x', 0, 0.15).to(pose.rotation, 'y', 0, 0.15).to(pose.rotation, 'z', 0, 0.15);
        tw.to(pose.position, 'x', 0, 0.15).to(pose.position, 'y', 0, 0.15).to(pose.position, 'z', 0, 0.15);
        tw.to(pose.scale, 'x', 1, 0.15).to(pose.scale, 'y', 1, 0.15).to(pose.scale, 'z', 1, 0.15);
    }
  }
}

// --- Rigid-part voxel characters ---------------------------------------------------
const modelCache = {};
function getModel(role) {
  if (modelCache[role]) return modelCache[role];
  const m = characterModel(role);
  m.partGeoms = m.parts.map((p) => {
    const parts = meshVox(p.vox, PAL, CV, [-p.pivot[0] * CV, -p.pivot[1] * CV, -p.pivot[2] * CV]);
    return toGeometries(parts);
  });
  modelCache[role] = m;
  return m;
}

export class VoxCharacter extends KitCharacter {
  constructor(role) {
    super(role);
    const model = getModel(role);
    this.shape = model.shape;
    this.height = model.height;
    this.parts = {};
    this.rest = {};
    this.collapsePose = {};
    this.collapse = 0;
    this.off = {};
    const pivots = {};
    model.parts.forEach((p, i) => {
      pivots[p.name] = p.pivot;
      const j = new THREE.Group();
      j.rotation.order = 'YXZ';
      let parentNode = this.pose;
      let piv = p.pivot;
      if (p.parent && this.parts[p.parent]) {
        parentNode = this.parts[p.parent];
        const pp = pivots[p.parent];
        piv = [p.pivot[0] - pp[0], p.pivot[1] - pp[1], p.pivot[2] - pp[2]];
      }
      j.position.set(piv[0] * CV, piv[1] * CV, piv[2] * CV);
      parentNode.add(j);
      this.parts[p.name] = j;
      this.rest[p.name] = j.position.clone();
      j.add(meshesFor(model.partGeoms[i], this.mats));
    });
    for (const name in model.collapse) {
      const [rot, pos, sc] = model.collapse[name];
      this.collapsePose[name] = { rot: new THREE.Vector3(...rot), pos: new THREE.Vector3(pos[0] * CV, pos[1] * CV, pos[2] * CV), sc: new THREE.Vector3(...sc) };
    }
  }

  hasNative(anim) { return ['idle', 'walk', 'attack', 'windup', 'die', 'rise'].includes(anim); }

  animLength(anim) {
    if (anim === 'die') return 0.75;
    if (anim === 'rise') return 1.0;
    return super.animLength(anim);
  }

  backendPlay(anim, speed) {
    this.ctw.clear();
    const s = Math.max(0.1, speed);
    if (anim === 'die') {
      this.ctw.to(this, 'collapse', 1, this.animLength('die') / s, bounceOut);
    } else if (anim === 'rise') {
      if (this.collapse < 0.05) this.collapse = 1.0;
      this.ctw.to(this, 'collapse', 0, this.animLength('rise') / s * 0.85, backOut, 0.12 / s);
    } else if (this.collapse > 0) {
      this.ctw.to(this, 'collapse', 0, 0.25);
    }
    return this.hasNative(anim);
  }

  so(n, rot, pos = [0, 0, 0], sc = null) { this.off[n] = [rot, pos, sc]; }

  tick() {
    const t = performance.now() / 1000 + this.timeOffset;
    this.off = {};
    const cur = this.current;
    const walk = cur === 'walk' || cur === 'dodge';
    const kAtt = clamp(this._animT / Math.max(0.01, this.animLength('attack')), 0, 1);
    const kWind = clamp(this._animT / 0.3, 0, 1);
    switch (this.shape) {
      case 'humanoid': {
        const ph = walk ? Math.sin(t * 8.5) : 0;
        const bob = walk ? Math.abs(Math.cos(t * 8.5)) * 0.04 : Math.sin(t * 2.2) * 0.01;
        this.so('hips', [0, ph * 0.08, 0], [0, bob, 0]);
        this.so('leg.L', [ph * 0.55, 0, 0]);
        this.so('leg.R', [-ph * 0.55, 0, 0]);
        this.so('arm.L', [-ph * 0.45 - 0.05, 0, 0.08 + Math.sin(t * 2.0) * 0.03]);
        let arm = [ph * 0.45, 0, -0.08];
        let torso = [0.05 * Math.abs(ph), -ph * 0.1, 0];
        if (cur === 'windup') {
          arm = [lerp(0, -2.6, kWind), 0, -0.2];
          torso = [lerp(0, -0.18, kWind), lerp(0, -0.35, kWind), 0];
        } else if (cur === 'attack') {
          const e = godotEase(kAtt, 0.35);
          arm = [lerp(-2.6, -0.35, e), 0, lerp(-0.2, 0.25, e)];
          torso = [lerp(-0.18, 0.25, e), lerp(-0.35, 0.3, e), 0];
        }
        this.so('arm.R', arm);
        this.so('torso', torso);
        this.so('head', [Math.sin(t * 1.3) * 0.05, Math.sin(t * 0.7) * 0.15, 0]);
        let chatter = 0;
        if (cur === 'windup' || cur === 'attack') chatter = 0.35;
        else if (cur === 'idle') chatter = Math.max(0, Math.sin(t * 3.0)) * 0.25 * Math.abs(Math.sin(t * 23.0));
        this.so('jaw', [chatter, 0, 0]);
        break;
      }
      case 'bat': {
        let f = Math.sin(t * 17.0);
        if (cur === 'attack') f = Math.sin(t * 30.0);
        this.so('wing.L', [0, 0, -f * 0.9]);
        this.so('wing.R', [0, 0, f * 0.9]);
        let lunge = 0;
        if (cur === 'windup') lunge = -0.3 * kWind;
        else if (cur === 'attack') lunge = Math.sin(kAtt * Math.PI) * 0.5;
        this.so('body', [lunge, 0, 0], [0, -f * 0.04, 0]);
        break;
      }
      case 'mimic': {
        let open;
        if (cur === 'attack' || cur === 'windup') open = -1.0 * Math.abs(Math.sin(this._animT * 12.0));
        else if (walk) open = -0.4 * Math.abs(Math.sin(t * 9.0));
        else open = -0.12 * Math.max(0, Math.sin(t * 1.5));
        this.so('lid', [open, 0, 0]);
        this.so('body', [0, 0, walk ? Math.sin(t * 9.0) * 0.08 : 0], [0, walk ? Math.abs(Math.sin(t * 9.0)) * 0.05 : 0, 0]);
        break;
      }
    }
    // apply anim offsets blended with the collapse pose
    for (const n in this.parts) {
      const j = this.parts[n];
      const o = this.off[n] || [[0, 0, 0], [0, 0, 0], null];
      let rot = o[0], pos = o[1], sc = o[2] || [1, 1, 1];
      const cp = this.collapsePose[n];
      const c = this.collapse;
      if (c > 0 && cp) {
        rot = [lerp(rot[0], cp.rot.x, c), lerp(rot[1], cp.rot.y, c), lerp(rot[2], cp.rot.z, c)];
        pos = [lerp(pos[0], cp.pos.x, c), lerp(pos[1], cp.pos.y, c), lerp(pos[2], cp.pos.z, c)];
        sc = [lerp(sc[0], cp.sc.x, c), lerp(sc[1], cp.sc.y, c), lerp(sc[2], cp.sc.z, c)];
      } else if (c > 0) {
        rot = [lerp(rot[0], 0, c), lerp(rot[1], 0, c), lerp(rot[2], 0, c)];
      }
      const r = this.rest[n];
      j.position.set(r.x + pos[0], r.y + pos[1], r.z + pos[2]);
      j.rotation.set(rot[0], rot[1], rot[2]);
      j.scale.set(sc[0], sc[1], sc[2]);
    }
  }
}

// --- Voxel Pip ---------------------------------------------------------------------
const DOWN = new THREE.Vector3(0, -1, 0);
const weaponGeomCache = {};
function weaponGeoms(id) {
  if (!weaponGeomCache[id]) weaponGeomCache[id] = toGeometries(meshVox(weaponVox(id), PAL, CV, [-0.5 * CV, 0, -0.5 * CV]));
  return weaponGeomCache[id];
}

// Shared once-loaded hero asset: { scene, animations, minY }.
export class VoxHero extends KitCharacter {
  constructor(asset, getWeaponId) {
    super('hero');
    this.getWeaponId = getWeaponId;
    this.model = cloneSkinned(asset.scene);
    this.model.position.y = -asset.minY;
    this.pose.add(this.model);
    this.height = asset.height;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.material = this.mats[SOLID];
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    this.bone = {};
    // GLTFLoader strips dots from node names ("arm.R" -> "armR")
    this.model.traverse((o) => { if (o.isBone) this.bone[o.name.replace('.', '')] = o; });
    this.armR = this.bone.armR;
    this.armL = this.bone.armL;
    this.restR = this.armR.quaternion.clone();
    this.restL = this.armL.quaternion.clone();
    this.attR = new THREE.Group();
    this.attL = new THREE.Group();
    this.armR.add(this.attR);
    this.armL.add(this.attL);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const clip of asset.animations) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      this.clips[clip.name.toLowerCase()] = { clip, action: a };
    }
    this.weaponId = '';
    this.syncWeapon();
    this.backendPlay('idle', 1);
  }

  hasNative(anim) { return !!this.clips[anim]; }
  animLength(anim) { return this.clips[anim] ? this.clips[anim].clip.duration : super.animLength(anim); }

  backendPlay(anim, speed) {
    if (this.clips[anim]) {
      this.mixer.timeScale = 1;
      this._fadeTo(this.clips[anim].action, speed);
      return true;
    }
    // No clip: keep a living base under the procedural layer.
    const base = anim === 'dodge' ? 'walk' : 'idle';
    if (anim === 'die') this.mixer.timeScale = 0;
    else if (this.clips[base]) {
      this.mixer.timeScale = 1;
      if (this.activeAction !== this.clips[base].action) this._fadeTo(this.clips[base].action, speed);
    }
    return false;
  }

  _fadeTo(action, speed) {
    action.timeScale = speed;
    if (this.activeAction && this.activeAction !== action) {
      action.reset().play();
      action.crossFadeFrom(this.activeAction, 0.15, false);
    } else if (!this.activeAction) {
      action.reset().play();
    }
    this.activeAction = action;
  }

  syncWeapon() {
    const id = this.getWeaponId();
    if (id === this.weaponId) return;
    this.weaponId = id;
    const hold = (att, wid, tilt) => {
      att.clear();
      if (!wid) return;
      const g = meshesFor(weaponGeoms(wid), this.mats);
      g.position.set(0, 0.36, -0.04);
      g.rotation.set(-Math.PI / 2 + tilt, 0, 0);
      att.add(g);
    };
    hold(this.attR, id === 'daggers' ? 'dagger' : id, id === 'spear' ? -0.25 : 0);
    hold(this.attL, id === 'daggers' ? 'dagger' : null, 0);
  }

  aim(rest, dir) {
    // rotation (character space) that swings the rest arm (pointing down) onto dir
    return new THREE.Quaternion().setFromUnitVectors(DOWN, dir.clone().normalize()).multiply(rest);
  }

  tick(dt) {
    this.mixer.update(dt);
    this.syncWeapon();
    const kAtt = clamp(this._animT / Math.max(0.01, this.animLength('attack')), 0, 1);
    if (this.current === 'windup' || this.current === 'attack') {
      const up = new THREE.Vector3(-0.35, 0.85, -0.4);        // raised over the right shoulder
      const down = new THREE.Vector3(0.45, -0.35, 0.85).normalize();   // across the body, in front
      let d, tw;
      if (this.current === 'windup') {
        const k = clamp(this._animT / 0.25, 0, 1);
        d = DOWN.clone().lerp(up, k);
        tw = -0.35 * k;
      } else {
        const e = godotEase(kAtt, 0.3);
        d = e < 1 ? slerpVec(up.clone().normalize(), down, e) : down;
        tw = lerp(-0.35, 0.45, e);
      }
      this.armR.quaternion.copy(this.aim(this.restR, d));
      const torso = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12));
      this.bone.torso.quaternion.copy(torso);
      if (this.weaponId === 'daggers') {
        const upL = new THREE.Vector3(0.35, 0.85, -0.4).normalize();
        const downL = new THREE.Vector3(-0.45, -0.35, 0.85).normalize();
        const dl = this.current === 'attack' ? slerpVec(upL, downL, godotEase(clamp(kAtt * 1.4 - 0.3, 0, 1), 0.3)) : upL;
        this.armL.quaternion.copy(this.aim(this.restL, dl));
      }
    }
  }
}

function slerpVec(a, b, t) {
  const q = new THREE.Quaternion().setFromUnitVectors(a, b);
  const part = new THREE.Quaternion().slerp(q, t);
  return a.clone().applyQuaternion(part);
}

// Factory used by the game.
export function makeCharacter(role, heroAsset, getWeaponId) {
  return role === 'hero' ? new VoxHero(heroAsset, getWeaponId) : new VoxCharacter(role);
}
