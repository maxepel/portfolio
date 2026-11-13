// Gameplay entities on the XZ plane (48 px = 1 m): Dren (hero), every foe, chests, and the
// upgrade pedestal. Numbers are ported verbatim from the Godot kit (hero.gd, foe.gd,
// chest.gd, pedestal.gd). Bodies are circles that slide along axis-aligned solid boxes.
import * as THREE from 'three';
import { VoxCharacter, VoxHero } from './character.js';
import { GameState } from './state.js';
import { makeProp, omni } from './world.js';
import { clamp, lerp, randRange, randInt, randf, backOut, Tweener } from './util.js';

const PX = 1.0 / 48.0;
const PI = Math.PI;
const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

// Move a circle body and push it out of the solid boxes (a few passes handle corners).
export function slideBody(b, solids, dt) {
  b.pos.x += b.vx * dt;
  b.pos.z += b.vz * dt;
  for (let pass = 0; pass < 3; pass++) {
    let hit = false;
    for (const s of solids) {
      if (s.gate && !s.active) continue;
      const cx = clamp(b.pos.x, s.x - s.hx, s.x + s.hx);
      const cz = clamp(b.pos.z, s.z - s.hz, s.z + s.hz);
      let dx = b.pos.x - cx, dz = b.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= b.r * b.r) continue;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        b.pos.x += (dx / d) * (b.r - d);
        b.pos.z += (dz / d) * (b.r - d);
      } else {
        // centre inside the box: leave through the nearest face
        const px = s.hx - Math.abs(b.pos.x - s.x), pz = s.hz - Math.abs(b.pos.z - s.z);
        if (px < pz) b.pos.x += Math.sign(b.pos.x - s.x || 1) * (px + b.r);
        else b.pos.z += Math.sign(b.pos.z - s.z || 1) * (pz + b.r);
      }
    }
    if (!hit) break;
  }
}

// ======================================================================================
// Hero: Dren
// ======================================================================================
const SPEED = 3.96;             // 190 px/s
const DODGE_SPEED = 9.6;        // 460 px/s
const DODGE_TIME = 0.20;
const DODGE_COOLDOWN = 0.55;
const SLAM_RADIUS = 2.9;
const SLAM_DAMAGE = 28;

export class Hero {
  constructor(game, start) {
    this.game = game;
    this.pos = new THREE.Vector3(start[0], 0, start[2]);
    this.vx = 0; this.vz = 0;
    this.r = 0.3;
    this.aimPoint = this.pos.clone();
    this.facing = new THREE.Vector3(0, 0, -1);
    this.canControl = true;
    this.inWater = false;
    this.attackBuf = 0; this.attackCd = 0; this.dodgeT = 0; this.dodgeCd = 0; this.invuln = 0; this.actT = 0;
    this.abilityCd = 0; this.abilityCharges = 3; this.dmgBuffT = 0; this.stepT = 0;
    this.root = new THREE.Group();
    this.vis = new VoxHero(game.heroAsset, () => GameState.weaponId);
    this.root.add(this.vis.root);
    this.vis.faceNow(this.facing);
    this.vis.play('idle');
    this.lamp = omni(0xffc890, 1.0, 5.0);
    this.lamp.position.set(0.35, 1.25, 0.15);
    this.root.add(this.lamp);
    this.root.position.copy(this.pos);
    game.scene.add(this.root);
  }

  dispose() { this.game.scene.remove(this.root); }

  slide(dt) { slideBody(this, this.game.level.solids, dt); }

  // 60 Hz physics step (Godot _physics_process)
  step(dt) {
    const g = this.game, input = g.input;
    this.attackCd = Math.max(0, this.attackCd - dt);
    // A click is remembered for a quarter second, so one made just before the cooldown ends (or
    // mid-dodge) still swings the moment it can, instead of being swallowed.
    if (input.pressed('attack')) this.attackBuf = 0.25;
    else this.attackBuf = Math.max(0, this.attackBuf - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.actT = Math.max(0, this.actT - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.dmgBuffT = Math.max(0, this.dmgBuffT - dt);
    if (!this.canControl) { this.vx = 0; this.vz = 0; this.slide(dt); return; }
    if (this.dodgeT > 0) { this.dodgeT -= dt; this.slide(dt); return; }
    const [ix, iy] = input.moveVector();
    const len = Math.hypot(ix, iy);
    if (len > 0.1) this.facing.set(ix / len, 0, iy / len);
    const spd = SPEED * (this.actT > 0 ? 0.35 : 1.0) * (this.inWater ? 0.5 : 1.0);
    this.vx = len > 0 ? (ix / len) * spd : 0;
    this.vz = len > 0 ? (iy / len) * spd : 0;
    this.slide(dt);
    if (this.attackBuf > 0 && this.attackCd <= 0) { this.attackBuf = 0; this.attack(); }
    if (input.pressed('dodge')) this.dodge(new THREE.Vector3(ix, 0, iy));
    if (input.pressed('ability')) this.useAbility();
    for (const [k, kind] of [['potion_1', 'red'], ['potion_2', 'blue'], ['potion_3', 'green']])
      if (input.pressed(k)) this.usePotion(kind);
  }

  // Per-frame visuals (Godot _process)
  frame(dt) {
    const vis = this.vis;
    vis.face(this.facing);
    const speed = Math.hypot(this.vx, this.vz);
    const moving = speed > 0.4;
    if (GameState.hp <= 0) { /* dying */ }
    else if (this.dodgeT > 0) { /* rolling */ }
    else if (this.actT > 0) { /* mid-swing */ }
    else if (moving) vis.play('walk', this.inWater ? 0.6 : 1.0);
    else vis.play('idle');
    if (moving && this.dodgeT <= 0 && this.canControl) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.inWater ? 0.42 : 0.3;
        this.game.snd.play('step', -18.0);
      }
    }
    this.root.position.copy(this.pos);
    vis.update(dt);
  }

  attack() {
    const g = this.game;
    if (this.attackCd > 0 || GameState.hp <= 0) return;
    const w = GameState.weapon();
    this.attackCd = w.cooldown;
    const to = this.aimPoint.clone().sub(this.pos); to.y = 0;
    if (to.length() > 0.2) this.facing.copy(to.normalize());
    this.vis.faceNow(this.facing);
    const length = this.vis.animLength('attack');
    const spd = clamp(length / Math.max(0.25, w.cooldown + 0.15), 1.0, 2.6);
    this.vis.play('attack', spd);
    this.actT = length / spd * 0.8;
    const reach = w.reach + 0.45;
    const arc = w.arc;
    g.fx.spawn('slash', this.pos, { pos: this.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), dir: this.facing.clone(), reach, arc });
    g.snd.play('swing', -4.0);
    g.timers.after(0.07, () => {                     // the blade lands a beat after the wind-up
      let dmg = w.damage;
      if (this.dmgBuffT > 0) dmg = Math.floor(dmg * 1.5);
      let hit = false;
      for (const e of g.level.enemies()) {
        const tx = e.pos.x - this.pos.x, tz = e.pos.z - this.pos.z;
        const dist = Math.hypot(tx, tz);
        if (dist > reach + e.radiusM) continue;
        if (dist > 0.2) {
          const ang = Math.atan2(this.facing.x * tz - this.facing.z * tx, this.facing.x * tx + this.facing.z * tz);
          if (Math.abs(ang) > arc * 0.5) continue;
        }
        const dir = dist > 0.05 ? new THREE.Vector3(tx / dist, 0, tz / dist) : this.facing.clone();
        e.hurt(dmg, dir, w.stun, false);
        hit = true;
      }
      if (hit) { g.level.hitStop(0.05); g.level.shake(0.12); }
    });
  }

  dodge(dir) {
    if (this.dodgeCd > 0 || this.inWater || GameState.hp <= 0) return;
    const d = dir.length() > 0.1 ? dir.clone().normalize() : this.facing.clone();
    this.facing.copy(d);
    this.vx = d.x * DODGE_SPEED; this.vz = d.z * DODGE_SPEED;
    this.dodgeT = DODGE_TIME;
    this.dodgeCd = DODGE_COOLDOWN;
    this.invuln = DODGE_TIME + 0.05;
    this.vis.faceNow(d);
    this.vis.play('dodge', 1.0);
    this.game.fx.spawn('dodge_dust', this.pos);
    this.game.snd.play('dodge', -2.0);
    this.game.snd.play('step', -10.0);
  }

  useAbility() {
    const g = this.game;
    if (this.abilityCd > 0) return;
    if (GameState.hasAbility('ground_slam')) {
      if (this.abilityCharges <= 0) return;
      this.abilityCd = 1.2;
      this.abilityCharges -= 1;
      this.vis.play('attack', 1.4);
      this.actT = 0.3;
      g.snd.play('boom', -4.0);
      g.fx.spawn('slam', this.pos, { radius: SLAM_RADIUS });
      g.level.shake(0.35);
      for (const e of g.level.enemies()) {
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < SLAM_RADIUS) {
          const away = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z);
          e.hurt(SLAM_DAMAGE, away.length() > 0.05 ? away.normalize() : this.facing.clone(), 0.4, false);
        }
      }
      g.hud.say('Ground slam!');
    } else {
      this.dodge(this.facing);
    }
  }

  usePotion(kind) {
    const g = this.game;
    if ((GameState.potions[kind] || 0) <= 0) return;
    GameState.potions[kind] -= 1;
    g.snd.play('potion');
    g.snd.play('powerup', -10.0);
    g.fx.spawn('heal', this.pos.clone().add(new THREE.Vector3(0, 1.0, 0)));
    if (kind === 'red') { GameState.heal(40); g.hud.say("That's the good stuff."); }
    else if (kind === 'blue') { this.abilityCharges = 3; g.hud.say('Recharged.'); }
    else { this.dmgBuffT = 8.0; g.hud.say('Feeling stabby.'); }
  }

  takeDamage(amount, from = null) {
    const g = this.game;
    if (this.invuln > 0 || GameState.hp <= 0) return;
    const dealt = Math.max(1, amount - GameState.damageReduction());
    GameState.hp = Math.max(0, GameState.hp - dealt);
    this.invuln = 0.45;
    g.snd.play('hurt', -4.0);
    this.vis.flash(srgb(1, 0.25, 0.25), 0.25);
    if (from) {
      const k = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z);
      if (k.length() > 1e-6) { k.normalize(); this.vx = k.x * 3.8; this.vz = k.z * 3.8; }
    }
    if (GameState.hp > 0) { this.vis.play('hurt', 1.5); this.actT = 0.25; }
    g.level.shake(0.25);
    g.hud.flashDamage(dealt);
    if (GameState.hp <= 0) {
      this.canControl = false;
      this.vis.play('die');
      g.level.onHeroDied();
    }
  }
}

// ======================================================================================
// Foes (data-driven from the biome config)
// ======================================================================================
const CHARGE_SPEED = 9.0;

export class Foe {
  constructor(game, cfg, pos) {
    this.game = game;
    this.cfg = { ...cfg };
    this.kind = cfg.kind ?? 'skeleton';
    this.isBoss = !!cfg.boss;
    this.role = cfg.role ?? this.defaultRole();
    this.maxHp = cfg.hp ?? 20;
    this.hp = this.maxHp;
    this.touchDamage = cfg.damage ?? 5;
    this.speed = (cfg.speed ?? 58.0) * PX;
    this.radiusM = (cfg.radius ?? 14.0) * PX;
    this.reanimates = !!cfg.reanimates;
    this.splits = cfg.splits ?? 0;
    this.gold = cfg.gold ?? 4;
    this.slamDmg = cfg.slam ?? 20;
    this.slamRadius = (cfg.slam_radius ?? 120.0) * PX;
    this.visScale = cfg.scale ?? 1.0;
    this.speedMult = 1.0;
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.vx = 0; this.vz = 0;
    this.r = Math.max(0.25, this.radiusM);
    this.alive = true;             // in the "enemies" group
    this.removed = false;
    this.state = 'spawn';
    this.mode = '';
    this.t = 0; this.timer = 0; this.cd = 0.8; this.stun = 0;
    this.reanimated = false;
    this.chargeDir = new THREE.Vector3(0, 0, -1);
    this.chargeHit = false;
    this.tele = null;
    this.hover = 0;
    this.root = new THREE.Group();
    this.vis = new VoxCharacter(this.role);
    this.vis.root.scale.setScalar(this.visScale);
    this.root.add(this.vis.root);
    if (this.kind === 'bat') { this.hover = 1.2; this.vis.root.position.y = this.hover; }
    const h = game.hero;
    if (h) this.vis.faceNow(new THREE.Vector3(h.pos.x - this.pos.x, 0, h.pos.z - this.pos.z));
    this.root.position.copy(this.pos);
    game.scene.add(this.root);
    if (this.kind === 'skeleton') {
      this.state = 'rise';
      this.vis.play('rise', 1.3);
      this.timer = this.vis.animLength('rise') / 1.3;
      game.snd.play('hit_bone', -8.0);
    } else {
      this.state = 'spawn';
      this.vis.play('idle');
      this.timer = 0.35;
    }
  }

  defaultRole() {
    if (this.kind === 'skeleton' && this.isBoss) return 'bone_warden';
    return this.kind;
  }

  dispose() {
    this.freeTele();
    this.game.scene.remove(this.root);
    this.removed = true;
  }

  stop() { this.vx = 0; this.vz = 0; }

  // 60 Hz physics step (Godot _physics_process)
  step(dt) {
    const g = this.game, hero = g.hero;
    this.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    this.stun = Math.max(0, this.stun - dt);
    const decay = 1 - Math.pow(0.8, dt * 60);       // velocity.lerp(0, 0.2) per 60 Hz frame
    let tx = hero.pos.x - this.pos.x, tz = hero.pos.z - this.pos.z;
    const dist = Math.hypot(tx, tz);
    const dir = dist > 0.01 ? new THREE.Vector3(tx / dist, 0, tz / dist) : new THREE.Vector3(0, 0, -1);
    const spd = this.speed * this.speedMult;
    switch (this.state) {
      case 'spawn': case 'rise': case 'getup':
        this.timer -= dt; this.stop();
        if (this.timer <= 0) this.state = 'chase';
        break;
      case 'down':
        this.timer -= dt; this.stop();
        if (this.timer <= 0) {
          this.state = 'getup';
          this.vis.play('rise', 1.2);
          this.timer = this.vis.animLength('rise') / 1.2;
          g.snd.play('hit_bone', -4.0);
        }
        break;
      case 'dying':
        this.timer -= dt; this.stop();
        if (this.timer <= 0) {
          this.vis.root.position.y -= dt * 0.8;
          if (this.vis.root.position.y < this.hover - 1.5) { this.dispose(); return; }
        }
        break;
      case 'windup':
        this.timer -= dt; this.stop();
        this.vis.face(this.mode === 'lunge' ? this.chargeDir : dir);
        if (this.timer <= 0) this.strike(dist);
        break;
      case 'charge':
        this.timer -= dt;
        this.vx = this.chargeDir.x * CHARGE_SPEED * Math.max(1.0, this.speedMult);
        this.vz = this.chargeDir.z * CHARGE_SPEED * Math.max(1.0, this.speedMult);
        if (!this.chargeHit && dist < this.radiusM + 0.8) { this.chargeHit = true; hero.takeDamage(this.slamDmg, this.pos); }
        if (this.timer <= 0) {
          this.state = 'recover'; this.timer = 1.0; this.vis.play('idle');
          g.snd.play('thump', -4.0); g.level.shake(0.2);
        }
        break;
      case 'recover':
        this.timer -= dt;
        this.vx *= 1 - decay; this.vz *= 1 - decay;
        if (this.timer <= 0) this.state = 'chase';
        break;
      case 'chase':
        this.chase(dist, dir, spd, decay);
        break;
    }
    slideBody(this, g.level.solids, dt);
    this.animate(dt, dir);
    this.root.position.copy(this.pos);
  }

  chase(dist, dir, spd, decay) {
    if (this.stun > 0) { this.vx *= 1 - decay; this.vz *= 1 - decay; return; }
    switch (this.role) {
      case 'bat': {
        const perp = [-dir.z, dir.x];
        const w = Math.sin(this.t * 6.0) * 70 * PX;
        this.vx = dir.x * spd + perp[0] * w;
        this.vz = dir.z * spd + perp[1] * w;
        this.touch(dist, 0.8);
        break;
      }
      case 'bone_warden':
        if (dist > this.slamRadius * 0.85) { this.vx = dir.x * spd; this.vz = dir.z * spd; }
        else if (this.cd <= 0) { this.beginWindup(0.6, 'slam', dir); this.cd = 2.4; }
        else { this.vx = -dir.z * spd * 0.5; this.vz = dir.x * spd * 0.5; }
        break;
      default:
        if (dist > this.radiusM + 0.7) { this.vx = dir.x * spd; this.vz = dir.z * spd; }
        else if (this.cd <= 0) { this.beginWindup(this.kind !== 'mimic' ? 0.38 : 0.3, 'melee', dir); this.cd = 1.1; }
        else this.stop();
    }
  }

  touch(dist, cooldown) {
    if (dist < this.radiusM + 0.45 && this.cd <= 0) {
      this.game.hero.takeDamage(this.touchDamage, this.pos);
      this.cd = cooldown;
      this.vis.play('attack', 1.5);
    }
  }

  beginWindup(t, mode, dir) {
    this.state = 'windup';
    this.mode = mode;
    this.timer = t;
    this.chargeDir.copy(dir);
    this.stop();
    this.vis.play('windup', this.vis.animLength('windup') / t);
    this.freeTele();
    if (mode === 'slam') {
      this.tele = this.game.fx.spawn('telegraph', this.pos, { radius: this.slamRadius, duration: t });
      this.game.snd.play('clang', -10.0);
    }
  }

  strike(dist) {
    const g = this.game;
    this.freeTele();
    if (this.mode === 'slam') {
      this.vis.play('attack', 1.2);
      g.snd.play('boom', -6.0); g.snd.play('clang', -6.0);
      g.fx.spawn('slam', this.pos, { radius: this.slamRadius });
      g.level.shake(0.5);
      if (dist < this.slamRadius) g.hero.takeDamage(this.slamDmg, this.pos);
      this.state = 'recover'; this.timer = 0.6;
    } else {
      this.vis.play('attack', 1.4);
      if (dist < this.radiusM + 1.0) g.hero.takeDamage(this.touchDamage, this.pos);
      this.state = 'chase';
    }
  }

  freeTele() { if (this.tele) this.game.fx.free(this.tele); this.tele = null; }

  animate(dt, dir) {
    const vis = this.vis;
    if (this.state === 'chase' || this.state === 'recover' || this.state === 'charge') {
      const fl = Math.hypot(this.vx, this.vz);
      if (this.state === 'charge') vis.face(this.chargeDir);
      else if (fl > 0.1) vis.face(new THREE.Vector3(this.vx, 0, this.vz));
      else vis.face(dir);
      if (this.state === 'chase' && ['idle', 'walk', 'hurt', 'attack', 'windup', 'rise', ''].includes(vis.current)) {
        if (!(['hurt', 'attack'].includes(vis.current) && !vis.animDone())) vis.play(fl > 0.1 ? 'walk' : 'idle');
      }
    }
    if (this.hover > 0 && this.state !== 'dying') vis.root.position.y = this.hover + Math.sin(this.t * 3.0) * 0.15;
  }

  frame(dt) { this.vis.update(dt); }

  // Struck by the hero. dir points away from the attacker.
  hurt(amount, dir, stun, _burn) {
    const g = this.game;
    if (['dying', 'down', 'rise', 'getup'].includes(this.state)) return;
    this.hp -= amount;
    this.vis.flash(srgb(1, 1, 1), 0.12);
    this.stun = Math.max(this.stun, (this.isBoss ? stun * 0.3 : stun) + (this.isBoss ? 0.0 : 0.12));
    if (this.state === 'chase') { const k = this.isBoss ? 1.0 : 3.2; this.vx = dir.x * k; this.vz = dir.z * k; }
    const col = this.kind === 'skeleton' ? srgb(0.9, 0.95, 1.0) : (this.kind === 'slime' ? srgb(0.4, 1.0, 0.7) : srgb(1.0, 0.3, 0.25));
    g.snd.play(this.hitSound(), -2.0);
    g.fx.spawn('hit', this.pos.clone().add(new THREE.Vector3(0, this.hover + this.vis.height * this.visScale * 0.6, 0)), { color: col });
    if (this.hp <= 0) this.die();
    else if (!this.isBoss && this.state === 'chase') this.vis.play('hurt', 1.6);
  }

  hitSound() {
    switch (this.kind) {
      case 'skeleton': return 'hit_bone';
      case 'slime': return 'hit_wet';
      case 'mimic': return 'hit_metal';
    }
    return 'hit_flesh';
  }

  die() {
    const g = this.game;
    this.freeTele();
    if (this.reanimates && !this.reanimated) {
      // Skeletons get back up once: teaches commitment.
      this.reanimated = true;
      GameState.count('reanimated');
      this.hp = Math.floor(this.maxHp * 0.5);
      this.state = 'down';
      this.vis.play('die', 1.3);
      this.timer = this.vis.animLength('die') / 1.3 + 1.0;
      g.snd.play('hit_bone', 0.0);
      return;
    }
    this.state = 'dying';
    GameState.count(this.role);
    GameState.gold += this.gold;
    this.alive = false;
    this.vis.play('die', 1.2);
    this.timer = this.vis.animLength('die') / 1.2 + 0.8;
    g.fx.spawn('death', this.pos.clone().add(new THREE.Vector3(0, this.hover + 0.4, 0)), { color: this.deathColor(), size: this.radiusM * this.visScale });
    if (this.kind === 'skeleton') g.snd.play('hit_bone', 2.0);
    g.level.onFoeDied(this);
  }

  deathColor() {
    switch (this.kind) {
      case 'skeleton': return srgb(0.85, 0.82, 0.72);
      case 'slime': return srgb(0.25, 0.8, 0.6);
      case 'bat': case 'rat': return srgb(0.6, 0.12, 0.12);
    }
    return srgb(0.5, 0.4, 0.3);
  }
}

// ======================================================================================
// Chest: wooden gives gold and maybe a red potion, iron (boss floor) gives Hero's Plate.
// One wooden chest in eight is a mimic that bites.
// ======================================================================================
export class Chest {
  constructor(game, iron, pos, yaw) {
    this.game = game;
    this.iron = iron;
    this.mimic = !iron && randInt(0, 7) === 0;
    this.opened = false;
    this.pos = pos.clone();
    this.root = makeProp(iron ? 'chest_iron' : 'chest', game.flicker);
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
    this.glow = game.level.takeLootLight(this.pos);
    this.tw = new Tweener();
    game.scene.add(this.root);
  }

  dispose() {
    this.game.scene.remove(this.root);
    this.releaseGlow();
  }

  releaseGlow() { if (this.glow) { this.game.level.releaseLootLight(this.glow); this.glow = null; } }

  update(dt) { this.tw.update(dt); }

  open() {
    const g = this.game;
    if (this.opened) return;
    this.opened = true;
    this.releaseGlow();
    if (this.mimic) {
      GameState.count('mimic_bites');
      g.snd.play('hit_heavy');
      g.level.addFoe({ kind: 'mimic', hp: 50, damage: 12, speed: 70.0, radius: 18.0, gold: 20 }, this.pos);
      g.hud.say("That's a tooth. That is a TOOTH—");
      this.dispose();
      this.gone = true;
      return;
    }
    const lid = this.root.userData.lid;
    if (lid) this.tw.to(lid.rotation, 'x', -1.9, 0.25, backOut);
    g.fx.spawn('gold', this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)));
    g.snd.play(this.iron ? 'latch' : 'chest');
    g.snd.play('coins', -4.0);
    if (this.iron) {
      GameState.gold += 30;
      GameState.equipPlate();
      g.snd.play('powerup', -6.0);
      g.hud.say("Hero's plate. Fits like it was waiting.");
    } else {
      GameState.gold += randInt(5, 15);
      if (randf() < 0.6) {
        GameState.potions.red += 1;
        g.snd.play('pickup', -6.0);
        g.hud.say("A red potion. Don't mind if I do.");
      } else {
        g.hud.say('Coin. The only loyal friend.');
      }
    }
  }
}

// ======================================================================================
// Pedestal: the boss-clear upgrade pick. Two stands rise with an item each; stand on the
// left or right half and press E.
// ======================================================================================
const SPREAD = 1.4;

export class Pedestal {
  constructor(game, options, at) {
    this.game = game;
    this.options = options;
    this.pick = 0;
    this.taken = false;
    this.t = 0;
    this.items = [];
    this.root = new THREE.Group();
    this.root.position.set(at[0], -1.2, at[2]);
    this.basePos = new THREE.Vector3(at[0], 0, at[2]);
    this.tw = new Tweener();
    this.solids = [];
    this.lights = [];
    for (let i = 0; i < Math.min(2, options.length); i++) {
      const x = -SPREAD + i * SPREAD * 2.0;
      const stand = makeProp('pedestal', game.flicker);
      stand.position.set(x, 0, 0);
      this.root.add(stand);
      this.solids.push({ x: at[0] + x, z: at[2], hx: 0.45, hz: 0.45 });
      const item = makeProp('item_' + options[i].id, game.flicker);
      item.position.set(x, 1.6, 0);
      this.root.add(item);
      this.items.push(item);
      const beam = game.level.takeSpotLight(new THREE.Vector3(at[0] + x, 6.0, at[2]));
      if (beam) this.lights.push(beam);
    }
    for (const s of this.solids) game.level.solids.push(s);
    game.scene.add(this.root);
    this.tw.to(this.root.position, 'y', 0, 0.8, backOut);
    game.fx.spawn('pickup', new THREE.Vector3(at[0], 1.2, at[2]));
    game.snd.play('powerup', -4.0);
  }

  dispose() {
    this.game.scene.remove(this.root);
    for (const s of this.solids) { const i = this.game.level.solids.indexOf(s); if (i >= 0) this.game.level.solids.splice(i, 1); }
    for (const l of this.lights) this.game.level.releaseSpotLight(l);
  }

  update(dt) {
    this.t += dt;
    this.tw.update(dt);
    const hero = this.game.hero;
    if (hero && !this.taken) this.pick = hero.pos.x - this.basePos.x < 0 ? 0 : 1;
    this.items.forEach((it, i) => {
      it.rotation.y += dt * (i === this.pick ? 2.0 : 0.6);
      it.position.y = 1.6 + Math.sin(this.t * 2.0 + i) * 0.08;
    });
  }

  near(p) { return Math.hypot(p.x - this.basePos.x, p.z - this.basePos.z) < 3.2; }

  take(i = -1) {
    if (this.taken || !this.options.length) return null;
    this.taken = true;
    if (i >= 0) this.pick = i;
    const g = this.game;
    const wp = new THREE.Vector3();
    this.items[this.pick].getWorldPosition(wp);
    g.fx.spawn('pickup', wp);
    g.snd.play('confirm');
    g.snd.jingle('jingles_NES03');
    return this.options[this.pick];
  }
}
