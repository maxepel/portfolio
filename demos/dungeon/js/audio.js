// Sound kit (port of snd.gd + audio.gd on Web Audio). Nothing is fetched or started until
// the player's first click (autoplay policy); every sound is optional and missing files
// are skipped silently. Named sounds pick a random variation, with +-5% pitch jitter.

const AU = 'assets/audio/';
const series = (prefix, n, first = 0) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + first).padStart(3, '0')}.ogg`);

const BANK = {
  swing: [AU + 'rpg/knifeSlice.ogg', AU + 'rpg/knifeSlice2.ogg'],
  hit_bone: series(AU + 'impact/impactWood_light_', 5),
  hit_flesh: series(AU + 'impact/impactPunch_medium_', 5),
  hit_wet: series(AU + 'impact/impactSoft_medium_', 5),
  hit_metal: series(AU + 'impact/impactMetal_medium_', 5),
  hit_heavy: series(AU + 'impact/impactPunch_heavy_', 5),
  dodge: [1, 2, 3, 4].map((i) => `${AU}rpg/cloth${i}.ogg`),
  step: Array.from({ length: 10 }, (_, i) => `${AU}rpg/footstep0${i}.ogg`),
  hurt: [1, 2, 3].map((i) => `${AU}sfx/hit_${i}.ogg`),
  boom: [1, 2, 3].map((i) => `${AU}sfx/explosion_${i}.ogg`),
  powerup: [1, 2, 3].map((i) => `${AU}sfx/powerup_${i}.ogg`),
  pickup: [1, 2, 3].map((i) => `${AU}sfx/pickup_${i}.ogg`),
  potion: series(AU + 'ui/glass_', 6, 1),
  coins: [AU + 'rpg/handleCoins.ogg', AU + 'rpg/handleCoins2.ogg'],
  chest: [1, 2, 3].map((i) => `${AU}rpg/creak${i}.ogg`),
  latch: [AU + 'rpg/metalLatch.ogg', AU + 'rpg/metalClick.ogg'],
  door_open: [1, 2].map((i) => `${AU}rpg/doorOpen_${i}.ogg`),
  door_close: [1, 2, 3, 4].map((i) => `${AU}rpg/doorClose_${i}.ogg`),
  confirm: series(AU + 'ui/confirmation_', 4, 1),
  card: [AU + 'ui/bong_001.ogg'],
  thump: series(AU + 'impact/impactSoft_heavy_', 5),
  clang: series(AU + 'impact/impactMetal_heavy_', 5),
  creak: [1, 2, 3].map((i) => `${AU}rpg/creak${i}.ogg`),
  chain: [AU + 'rpg/beltHandle1.ogg', AU + 'rpg/beltHandle2.ogg', AU + 'rpg/metalPot1.ogg'],
};

export const MUSIC_TENSE = AU + 'music/hard-dungeon.ogg';
export const MUSIC_DARK = AU + 'music/whispers-in-the-fog.ogg';

const db = (x) => Math.pow(10, x / 20);

export class Snd {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();       // path -> AudioBuffer | Promise
    this.muted = false;
    this.music = null;              // { path, src, gain }
    this.musicPath = '';
  }

  get ready() { return !!this.ctx; }

  // Call from a user gesture.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : db(-4);
      this.master.connect(this.ctx.destination);
      // warm the cache in the background, most-used first
      const first = ['swing', 'hit_bone', 'step', 'hurt', 'dodge', 'card', 'door_close'];
      for (const k of first) for (const p of BANK[k]) this.load(p);
      setTimeout(() => { for (const k in BANK) for (const p of BANK[k]) this.load(p); }, 1200);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : db(-4);
  }

  load(path) {
    if (!this.ctx) return Promise.resolve(null);
    const hit = this.buffers.get(path);
    if (hit) return hit instanceof Promise ? hit : Promise.resolve(hit);
    const p = fetch(path)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => { this.buffers.set(path, buf); return buf; })
      .catch(() => { this.buffers.set(path, null); return null; });
    this.buffers.set(path, p);
    return p;
  }

  // One-shot sound.
  file(path, vol = 0, jitter = 0.05) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers.get(path);
    if (!buf) { if (buf === undefined) this.load(path); return; }
    if (buf instanceof Promise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
    const g = this.ctx.createGain();
    g.gain.value = db(vol);
    src.connect(g).connect(this.master);
    src.start();
  }

  play(key, vol = 0) {
    const list = BANK[key];
    if (!list) return;
    this.file(list[Math.floor(Math.random() * list.length)], vol);
  }

  jingle(name, vol = -4) { this.file(`${AU}jingles/${name.replace('.ogg', '')}.ogg`, vol, 0); }

  // Looping music with a short crossfade; asking for the playing track does nothing.
  playMusic(path, vol = -8, fade = 1.0) {
    if (!this.ctx) return;
    if (path === this.musicPath && this.music) return;
    this.musicPath = path;
    this.fadeOutMusic(fade * 0.5);
    this.load(path).then((buf) => {
      if (!buf || this.musicPath !== path) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.master);
      src.start();
      g.gain.setTargetAtTime(db(vol), this.ctx.currentTime + fade * 0.4, fade * 0.2);
      this.music = { path, src, gain: g };
    });
  }

  fadeOutMusic(sec) {
    const m = this.music;
    if (!m) return;
    this.music = null;
    m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, sec * 0.35);
    setTimeout(() => { try { m.src.stop(); } catch (e) { /* already stopped */ } }, sec * 1000 + 400);
  }

  stopMusic() {
    this.musicPath = '';
    this.fadeOutMusic(1.0);
  }
}
