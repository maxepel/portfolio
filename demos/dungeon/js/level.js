// One biome = one room reused for several floors. Builds the room, then runs the flow:
// fighting (doors sealed, waves) -> cleared (doors open, chests) -> walk out the exit ->
// next floor ... last floor = boss -> pedestal pick -> level complete. Port of the Godot
// KitLevel (core/level.gd) for the Upper Crypts.
import * as THREE from 'three';
import { buildRoom, DOOR_W, omni } from './world.js';
import { CRYPTS_CONFIG, cryptsLayout } from './crypts.js';
import { Hero, Foe, Chest, Pedestal } from './entities.js';
import { GameState } from './state.js';
import { MUSIC_DARK, MUSIC_TENSE } from './audio.js';
import { moveToward, randf, randRange, randInt, pick, Timers } from './util.js';

// Follow camera (KitCamera): three-quarter top-down, long lens.
export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.target = null;
    this.offset = new THREE.Vector3(0, 17.2, 11.4);
    this.followWeight = new THREE.Vector3(0.6, 0.0, 0.5);
    this.focusBias = new THREE.Vector3(0, 0, -0.2);
    this.lookHeight = 0.6;
    this.smooth = 3.0;
    this.shakeScale = 0.25;
    this._shake = 0;
    this.t = 0;
    this.snapped = false;
  }
  setTarget(n) { this.target = n; this.snapped = false; }
  shake(a) { this._shake = Math.max(this._shake, a); }
  focus() {
    if (!this.target) return this.focusBias.clone();
    return this.target.pos.clone().multiply(this.followWeight).add(this.focusBias);
  }
  update(dt) {
    this.t += dt;
    const focus = this.focus();
    const want = focus.clone().add(this.offset);
    if (!this.snapped) { this.cam.position.copy(want); this.snapped = true; }
    else this.cam.position.lerp(want, Math.min(1, dt * this.smooth));
    this._shake = Math.max(0, this._shake - dt * 1.8);
    const j = new THREE.Vector3(Math.sin(this.t * 61), Math.sin(this.t * 47 + 1), 0).multiplyScalar(this._shake * this.shakeScale);
    const look = focus.add(new THREE.Vector3(0, this.lookHeight, 0)).add(j);
    this.cam.lookAt(look);
  }
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export class Level {
  constructor(game) {
    this.game = game;
    game.level = this;            // entities reach the level through the game while it is still being built
    this.cfg = CRYPTS_CONFIG;
    this.lay = cryptsLayout();
    this.state = 'intro';
    this.floorIndex = 0;
    this.wave = 0;
    this.foes = [];
    this.chests = [];
    this.pedestal = null;
    this.boss = null;
    this.t = 0;
    this.ambT = 2.0;
    this.said = '';
    this.gateClosed = true;
    this.checkNext = false;
    this.timers = game.timers;

    // The room and its lights live under one group so a restart is a clean swap.
    this.scene = new THREE.Group();
    game.scene.add(this.scene);
    this.room = buildRoom(this.scene, this.lay, game.flicker);
    this.solids = this.room.solids;
    this.half = this.lay.half;
    this.doorX = this.lay.door_x;
    // Light pools: the light count must stay constant so shaders never recompile mid-game.
    this.lootPool = [0, 1].map(() => this.makePoolLight(omni(0xffc44a, 0.6, 2.0), 0));
    this.spotPool = [0, 1].map(() => {
      const s = new THREE.SpotLight(0xffffff, 0, 12, 0.5, 0.35, 0.8);
      s.target.position.set(0, 0, 0);
      this.scene.add(s, s.target);
      return { light: s, busy: false };
    });

    this.hero = new Hero(game, this.lay.hero_start);
    game.hero = this.hero;
    game.cameraRig.setTarget(this.hero);
    game.hud.showCard(`${this.cfg.floor_prefix}${this.cfg.floor_start} — ${this.cfg.biome_name.toUpperCase()}`);
    game.hud.say(this.cfg.intro_bark);
    GameState.logEvent(`level_start ${this.cfg.biome_id}`);
    this.startFloor();
  }

  dispose() {
    for (const f of this.foes) f.dispose();
    for (const c of this.chests) if (!c.gone) c.dispose();
    if (this.pedestal) this.pedestal.dispose();
    this.hero.dispose();
    this.game.scene.remove(this.scene);
    this.game.flicker.flames.length = 0;
    this.game.flicker.lights.length = 0;
  }

  // --- light pools ----------------------------------------------------------------
  makePoolLight(light) {
    light.intensity = 0;
    this.scene.add(light);
    return { light, busy: false, base: 0.6 * Math.PI };
  }
  takeLootLight(pos) {
    const slot = this.lootPool.find((s) => !s.busy);
    if (!slot) return null;
    slot.busy = true;
    slot.light.position.set(pos.x, pos.y + 0.9, pos.z);
    slot.light.intensity = slot.base;
    return slot;
  }
  releaseLootLight(slot) { slot.busy = false; slot.light.intensity = 0; }
  takeSpotLight(pos, kind = 'pedestal') {
    const slot = this.spotPool.find((s) => !s.busy);
    if (!slot) return null;
    slot.busy = true;
    const l = slot.light;
    l.position.copy(pos);
    l.target.position.set(pos.x, 0, pos.z);
    if (kind === 'boss') { l.color.set(0xff8a70); l.intensity = 2.5 * Math.PI; l.distance = 12; l.angle = (38 * Math.PI) / 180; }
    else { l.color.set(0x5cf6ff); l.intensity = 4.0 * Math.PI; l.distance = 9; l.angle = (16 * Math.PI) / 180; }
    return slot;
  }
  releaseSpotLight(slot) { slot.busy = false; slot.light.intensity = 0; }

  enemies() { return this.foes.filter((f) => f.alive && !f.removed); }

  // --- called by hero / foes ----------------------------------------------------------
  shake(a) { this.game.cameraRig.shake(a); }
  hitStop(sec) { this.game.hitStop(sec); }

  // --- frame ----------------------------------------------------------------------------
  step(dt) {
    if (this.hero) this.hero.step(dt);
    for (const f of this.foes) if (!f.removed) f.step(dt);
    this.foes = this.foes.filter((f) => !f.removed);
  }

  frame(dt) {
    const g = this.game;
    this.t += dt;
    if (this.checkNext) { this.checkNext = false; this.afterFoeDeath(); }
    this.hero.aimPoint.copy(this.mouseOnFloor());
    this.animateGate(dt);
    this.ambience(dt);
    this.tickInteract();
    if (this.state === 'cleared') {
      const hp = this.hero.pos;
      if (hp.z > this.half[1] + 0.6 && Math.abs(hp.x - this.doorX) < DOOR_W * 0.6) this.nextFloor();
    }
    this.hero.frame(dt);
    for (const f of this.foes) f.frame(dt);
    for (const c of this.chests) if (!c.gone) c.update(dt);
    if (this.pedestal) this.pedestal.update(dt);
  }

  mouseOnFloor() {
    const g = this.game, m = g.input.mouse;
    const rect = g.canvas.getBoundingClientRect();
    ndc.set(((m.x - rect.left) / rect.width) * 2 - 1, -(((m.y - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(ndc, g.camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (Math.abs(d.y) < 0.001) return this.hero.pos;
    return o.clone().addScaledVector(d, -o.y / d.y);
  }

  animateGate(dt) {
    const gate = this.room.gate;
    const target = this.gateClosed ? 0.0 : 2.4;
    gate.position.y = moveToward(gate.position.y, target, dt * 2.5);
    this.room.gateSolid.active = this.gateClosed;
  }

  ambience(dt) {
    const bed = this.cfg.ambience;
    this.ambT -= dt;
    if (this.ambT <= 0 && bed.length) {
      this.ambT = randRange(1.8, 4.5);
      this.game.snd.play(pick(bed), -20.0 + (this.state === 'fighting' ? -6.0 : 0.0));
    }
  }

  // --- flow -----------------------------------------------------------------------------
  floors() { return this.cfg.floors; }
  floorTag() { return `${this.cfg.floor_prefix}${this.cfg.floor_start + this.floorIndex}`; }

  startFloor() {
    const g = this.game, cfg = this.cfg;
    this.state = 'fighting';
    this.wave = 0;
    this.gateClosed = true;
    g.snd.playMusic(MUSIC_TENSE, -14.0);
    g.snd.play('door_close', -4.0);
    const isLast = this.floorIndex >= this.floors() - 1;
    if (isLast) {
      g.hud.showCard(cfg.boss_name, 1.6);
      g.snd.jingle('jingles_HIT03', -6.0);
      this.boss = this.addFoe(cfg.boss, new THREE.Vector3(...this.lay.boss_spawn));
      g.hud.setBoss(this.boss, cfg.boss_name);
      this.bossLight = this.takeSpotLight(new THREE.Vector3(0, 6.0, 0), 'boss');
      for (let i = 0; i < cfg.boss_adds; i++) this.addFoe(this.poolPick(), this.spawnPoint());
    } else {
      this.spawnWave();
      if (this.floorIndex > 0) g.hud.showCard(this.floorTag(), 1.2);
    }
    this.spawnChests(isLast);
    const barks = cfg.floor_barks;
    if (this.floorIndex > 0 && this.floorIndex < barks.length && !isLast) g.hud.say(barks[this.floorIndex]);
    GameState.logEvent(`floor_start ${cfg.biome_id} ${this.floorTag()}${isLast ? ' (boss)' : ''}`);
  }

  wavesThisFloor() { return this.floorIndex === 0 ? 1 : 2; }

  spawnWave() {
    const n = this.wave === 0 ? 3 + this.floorIndex * 2 : 2 + this.floorIndex;
    for (let i = 0; i < n; i++) this.addFoe(this.poolPick(), this.spawnPoint());
    this.wave += 1;
  }

  poolPick() { return pick(this.cfg.enemy_pool); }

  spawnPoint() {
    const [hx, hz] = this.half;
    let p = new THREE.Vector3();
    for (let i = 0; i < 24; i++) {
      p = new THREE.Vector3(randRange(-hx + 1.2, hx - 1.2), 0, randRange(-hz + 1.3, hz - 2.2));
      let ok = true;
      for (const a of this.lay.avoid) if (Math.hypot(p.x - a.pos[0], p.z - a.pos[1]) < a.r) ok = false;
      if (ok && (!this.hero || p.distanceTo(this.hero.pos) > 3.4)) break;
    }
    return p;
  }

  addFoe(base, pos) {
    const f = new Foe(this.game, base, pos);
    this.foes.push(f);
    return f;
  }

  onFoeDied(f) {
    if (f === this.boss) {
      GameState.bossesKilled.push(this.cfg.boss_name);
      GameState.logEvent(`boss_killed ${this.cfg.boss_name}`);
    }
    this.checkNext = true;       // evaluated next frame, after the death settles
  }

  afterFoeDeath() {
    if (this.state !== 'fighting') return;
    if (this.enemies().length) return;
    if (this.floorIndex >= this.floors() - 1) {
      if (!this.boss || this.boss.hp <= 0) this.onBossCleared();
    } else if (this.wave < this.wavesThisFloor()) {
      this.game.hud.showCard(`WAVE ${this.wave + 1}`, 0.8);
      this.spawnWave();
    } else {
      this.onFloorCleared();
    }
  }

  onFloorCleared() {
    this.state = 'cleared';
    this.gateClosed = false;
    GameState.floorsCleared += 1;
    GameState.logEvent(`floor_cleared ${this.cfg.biome_id} ${this.floorTag()}`);
    this.game.snd.playMusic(MUSIC_DARK);
    this.game.snd.play('door_open');
    this.game.hud.say('Doors unlocked. Loot located.');
  }

  nextFloor() {
    this.floorIndex += 1;
    for (const f of this.foes) f.dispose();
    this.foes = [];
    for (const c of this.chests) if (!c.gone) c.dispose();
    this.chests = [];
    this.hero.pos.set(this.lay.hero_start[0], 0, this.lay.hero_start[2]);
    this.hero.vx = 0; this.hero.vz = 0;
    this.startFloor();
  }

  onBossCleared() {
    const g = this.game, cfg = this.cfg;
    this.state = 'pedestal';
    GameState.floorsCleared += 1;
    GameState.logEvent(`floor_cleared ${cfg.biome_id} ${this.floorTag()} (boss)`);
    if (this.bossLight) { this.releaseSpotLight(this.bossLight); this.bossLight = null; }
    this.gateClosed = true;
    g.snd.playMusic(MUSIC_DARK, -12.0);
    g.snd.jingle('jingles_NES00');
    g.hud.say(cfg.clear_bark);
    g.hud.showCard('UPGRADE', 1.5);
    this.pedestal = new Pedestal(g, cfg.upgrades, this.lay.pedestal_at);
  }

  takeUpgrade(choice) {
    if (this.state === 'done') return;
    const g = this.game;
    this.state = 'done';
    GameState.takeUpgrade(this.cfg.biome_name, choice);
    g.hud.say("New toy. Let's go deeper.");
    GameState.logEvent(`level_complete ${this.cfg.biome_id} kills=${JSON.stringify(GameState.kills)}`);
    g.timers.after(1.4, () => g.onLevelComplete());
  }

  onHeroDied() {
    const g = this.game;
    this.state = 'dead';
    GameState.deaths += 1;
    GameState.logEvent(`hero_died ${this.cfg.biome_id} ${this.floorTag()}`);
    g.snd.stopMusic();
    g.snd.jingle('jingles_NES09');
    g.hud.showCard('YOU DIED', 1.5);
    g.timers.after(2.0, () => { GameState.hp = GameState.maxHp; g.restartLevel(); });
  }

  // --- chests and prompts ---------------------------------------------------------------
  spawnChests(isLast) {
    const n = isLast ? 1 : randInt(1, 2);
    for (let i = 0; i < n; i++) {
      const c = new Chest(this.game, isLast && i === 0, this.spawnPoint(), randRange(-0.5, 0.5));
      this.chests.push(c);
    }
  }

  tickInteract() {
    const g = this.game, hero = this.hero;
    const interact = g.input.pressed('interact');
    let text = '';
    for (const c of this.chests) {
      if (c.gone || c.opened) continue;
      if (Math.hypot(c.pos.x - hero.pos.x, c.pos.z - hero.pos.z) < 1.5) {
        text = '[E] open';
        if (interact) c.open();
      }
    }
    if (this.state === 'pedestal' && this.pedestal && !this.pedestal.taken && this.pedestal.near(hero.pos)) {
      const o = this.pedestal.options[this.pedestal.pick];
      text = `${o.name} — ${o.desc}   [E] take`;
      if (interact) { const choice = this.pedestal.take(); if (choice) this.takeUpgrade(choice); }
    }
    if (this.state === 'cleared' && text === '') text = 'Exit open: take the stairs';
    if (text !== this.said) { this.said = text; g.hud.prompt(text); }
  }

  // --- test hooks -----------------------------------------------------------------------
  // Pushes the level forward the way a player would (used by the headless playthrough).
  autoplay() {
    const hero = this.hero;
    GameState.hp = GameState.maxHp;
    switch (this.state) {
      case 'fighting':
        for (const e of this.enemies()) {
          const to = new THREE.Vector3(e.pos.x - hero.pos.x, 0, e.pos.z - hero.pos.z);
          e.hurt(60, to.length() > 0.05 ? to.normalize() : new THREE.Vector3(0, 0, -1), 0.3, false);
        }
        break;
      case 'cleared':
        for (const c of this.chests) {
          if (!c.gone && !c.opened) { hero.pos.set(c.pos.x, 0, c.pos.z + 1.0); c.open(); return; }
        }
        hero.pos.set(this.doorX, 0, this.half[1] + 0.9);
        break;
      case 'pedestal':
        if (this.pedestal) {
          hero.pos.set(this.pedestal.basePos.x - 1.4, 0, this.pedestal.basePos.z + 1.8);
          const choice = this.pedestal.take(0);
          if (choice) this.takeUpgrade(choice);
        }
        break;
    }
  }
}
