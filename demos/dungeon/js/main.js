// Dungeon Kit (Voxel), Level 1 demo: boot, title -> play -> end, render loop.
// Embed contract: ?embed=1 hides standalone chrome; Close / Esc on the end screen post
// {type: 'portfolio:close-game'} to the parent window.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { Snd, MUSIC_DARK } from './audio.js';
import { Hud } from './hud.js';
import { GameState } from './state.js';
import { Level, CameraRig } from './level.js';
import { TitleScene } from './title.js';
import { Fx } from './fx.js';
import { Flicker } from './world.js';
import { COLORS } from './palette.js';
import { Timers, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const EMBED = params.get('embed') === '1';
const STEP = 1 / 60;

class Game {
  constructor() {
    this.canvas = $('view');
    this.mode = 'loading';           // loading | title | playing | paused | end
    this.prevMode = 'title';
    this.timers = new Timers();
    this.snd = new Snd();
    this.input = new Input(this.canvas);
    this.hud = new Hud(this.snd);
    this.flicker = new Flicker();
    this.timeScale = 1;
    this.hitStopLeft = 0;
    this.clock = 0;
    this.acc = 0;
    this.level = null;
    this.hero = null;
    this.frameTimes = [];
    this.quality = 2;                // 2 = bloom + DPR 1.5, 1 = no bloom, 0 = DPR 1
    this.initRenderer();
    this.initScenes();
  }

  initRenderer() {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    r.setPixelRatio(this.pixelRatioFor(window.innerWidth, window.innerHeight));
  }

  initScenes() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.006);
    this.scene.add(new THREE.AmbientLight(COLORS.ambient, 0.55 * Math.PI));
    this.camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 150);
    this.baseFov = 28;
    this.cameraRig = new CameraRig(this.camera);
    this.fx = new Fx(this.scene);
  }

  async load() {
    this.heroAsset = await loadHero();
    this.title = new TitleScene(this.heroAsset);
    this.sceneNow = this.title.scene;
    this.cameraNow = this.title.camera;
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.sceneNow, this.cameraNow);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 1.0);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Cap the pixel count so big or retina screens stay fast (the voxel look needs no more).
  pixelRatioFor(w, h) {
    return Math.max(1, Math.min(this.maxDpr, Math.sqrt(2.6e6 / Math.max(1, w * h))));
  }

  resize() {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatioFor(w, h));
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const aspect = w / h;
    // Keep the room in view on narrow windows: widen the vertical fov below 16:9.
    const fitFov = (base) => (aspect >= 16 / 9 ? base : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * (16 / 9) / aspect)));
    this.camera.fov = Math.min(70, fitFov(this.baseFov));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.title) {
      this.title.camera.fov = Math.min(70, fitFov(this.title.baseFov));
      this.title.camera.aspect = aspect;
      this.title.camera.updateProjectionMatrix();
    }
    document.documentElement.style.setProperty('--s', clamp(Math.min(w / 1920, h / 1080), 0.5, 1.4).toFixed(3));
  }

  setView(scene, camera) {
    this.sceneNow = scene;
    this.cameraNow = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  // --- screens ----------------------------------------------------------------------------
  show(id, on) { $(id).classList.toggle('hidden', !on); }

  showTitle() {
    this.mode = 'title';
    this.input.enabled = false;
    this.setView(this.title.scene, this.title.camera);
    this.show('screen-title', true); this.show('screen-end', false); this.hud.hide();
    $('play').focus({ preventScroll: true });
  }

  start() {
    if (this.mode !== 'title' && this.mode !== 'end') return;
    this.snd.unlock();
    this.snd.play('confirm');
    GameState.startFreshRun();
    GameState.logEvent('run_start');
    this.beginLevel();
  }

  beginLevel() {
    this.show('screen-title', false); this.show('screen-end', false);
    this.hud.reset();
    this.timers.clear();
    this.fx.clear();
    if (this.level) this.level.dispose();
    this.level = new Level(this);
    this.hud.hero = this.hero;
    this.setView(this.scene, this.camera);
    this.renderer.compile(this.scene, this.camera);       // build every shader now, not mid-fight
    this.hud.show();
    this.mode = 'playing';
    this.input.enabled = true;
    this.input.clear();
    this.canvas.focus({ preventScroll: true });
  }

  restartLevel() {
    this.beginLevel();
  }

  onLevelComplete() {
    this.mode = 'end';
    this.input.enabled = false;
    this.snd.stopMusic();
    this.snd.jingle('jingles_NES03');
    const gs = GameState;
    const t = Math.floor(gs.runTime);
    $('end-stats').textContent = `Floors cleared ${gs.floorsCleared}    Bosses ${gs.bossesKilled.length ? gs.bossesKilled.join(', ') : 'none'}    Gold ${gs.gold}    Time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const kills = Object.values(gs.kills || {}).reduce((a, b) => a + b, 0);
    $('end-stats').textContent = `Enemies defeated ${kills}    Gold ${gs.gold}    Time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    $('end-picked').textContent = `You cleared all three floors and beat the Bone Warden.${Object.keys(gs.upgradesTaken).length ? ` Picked: ${Object.values(gs.upgradesTaken).join(', ')}.` : ''}`;
    gs.logEvent(`run_end floors=${gs.floorsCleared} bosses=${gs.bossesKilled} gold=${gs.gold} deaths=${gs.deaths}`);
    this.hud.hide();
    this.setView(this.title.scene, this.title.camera);
    this.show('screen-end', true);
    $('again').focus({ preventScroll: true });
  }

  // Back to the portfolio: the parent page closes the overlay, or a standalone tab goes back to it.
  close() {
    this.snd.stopMusic();
    if (EMBED && window.parent !== window) window.parent.postMessage({ type: 'portfolio:close-game' }, '*');
    else location.href = '../index.html#node-maps';
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.prevMode = this.mode;
    this.mode = 'paused';
    this.input.clear();
    this.snd.suspend();
    this.show('screen-pause', true);
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = this.prevMode;
    this.show('screen-pause', false);
    this.input.clear();
    this.snd.resume();
    this.last = performance.now();
    this.canvas.focus({ preventScroll: true });
  }

  hitStop(sec) { this.timeScale = 0.05; this.hitStopLeft = Math.max(this.hitStopLeft, sec); }

  // --- frame ----------------------------------------------------------------------------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const real = Math.min(0.1, Math.max(0, (now - (this.last ?? now)) / 1000));
    this.last = now;
    this.adapt(real);
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= real;
      if (this.hitStopLeft <= 0) this.timeScale = 1;
    }
    const t0 = performance.now();
    const dt = this.mode === 'paused' ? 0 : real * this.timeScale;
    this.clock += dt;
    if (this.mode === 'playing' && this.level) {
      GameState.runTime += dt;
      this.timers.update(dt);
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) { this.level.step(STEP); this.acc -= STEP; n++; }
      if (n === 5) this.acc = 0;
      this.level.frame(dt);
      this.flicker.update(dt, this.clock);
      this.cameraRig.update(dt);
      this.fx.update(dt);
      this.hud.update(dt);
      this.updateMs = (this.updateMs ?? 0) * 0.95 + (performance.now() - t0) * 0.05;
      this.input.queued.clear();            // presses are only good for the frame they happen in
    } else if (this.mode === 'title' || this.mode === 'end') {
      this.title.update(dt, this.clock);
      if (this.mode === 'end') this.timers.update(dt);
    }
    this.composer.render();
  }

  // Drop quality if the frame time stays high (software GL, weak laptops).
  adapt(real) {
    if (this.mode === 'paused' || real <= 0) return;
    this.frameTimes.push(real);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 0.034 && this.quality > 0) {
      this.quality -= 1;
      if (this.quality === 1) this.bloom.enabled = false;
      if (this.quality === 0) { this.maxDpr = 1; this.resize(); }
    }
  }
}

// --- hero asset ---------------------------------------------------------------------------
function loadHero() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load('assets/hero/vox_pip_anim.glb', (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry.computeBoundingBox();
          box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
        }
      });
      resolve({ scene: gltf.scene, animations: gltf.animations, minY: box.min.y, height: box.max.y - box.min.y });
    }, undefined, reject);
  });
}

// --- boot ---------------------------------------------------------------------------------
async function boot() {
  if (EMBED) document.body.classList.add('embed');

  let game;
  try {
    game = new Game();
    await game.load();
  } catch (e) {
    console.error(e);
    $('loading-text').textContent = 'This demo needs WebGL. Try another browser.';
    return;
  }
  window.__dungeon = { game, GameState };            // handle for the headless playthrough
  // buttons and keys
  $('play').addEventListener('click', () => game.start());
  $('screen-title').addEventListener('click', () => game.start());      // click anywhere to descend
  // the first gesture unlocks audio, so the title can have its music
  window.addEventListener('pointerdown', () => {
    game.snd.unlock();
    if (game.mode === 'title') game.snd.playMusic(MUSIC_DARK, -10.0);
  });
  $('again').addEventListener('click', () => game.start());
  $('close').addEventListener('click', () => game.close());
  $('exitbtn').addEventListener('click', () => game.close());
  $('screen-pause').addEventListener('pointerdown', () => game.resume());
  const mute = $('soundbtn');
  const setMuted = (m) => {
    game.snd.setMuted(m);
    mute.textContent = `Sound: ${m ? 'off' : 'on'} (M)`;
    mute.setAttribute('aria-pressed', String(m));
  };
  mute.addEventListener('click', () => { setMuted(!game.snd.muted); mute.blur(); game.canvas.focus({ preventScroll: true }); });
  window.addEventListener('keydown', (e) => {
    if (game.mode === 'paused') { game.resume(); return; }
    if (e.code === 'KeyM') { setMuted(!game.snd.muted); return; }
    if ((game.mode === 'title') && (e.code === 'Enter' || e.code === 'KeyE')) { e.preventDefault(); game.start(); return; }
    if (game.mode === 'end') {
      if (e.code === 'Enter') { e.preventDefault(); game.start(); }
      else if (e.code === 'Escape') game.close();
      return;
    }
    if (game.mode === 'playing' && e.code === 'Escape') game.pause();
  });
  // Leaving to click Exit (or anything outside the game) must not stop the click from landing.
  window.addEventListener('blur', () => { if (!document.activeElement || document.activeElement.id !== 'exitbtn') game.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
  $('loading').classList.add('hidden');
  game.showTitle();
  requestAnimationFrame((t) => game.frame(t));
}

boot();
