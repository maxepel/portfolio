// Headless playthrough of the Level 1 demo with real keyboard/mouse input: boots, clicks Play,
// fights three floors and the Bone Warden, opens chests, takes the upgrade, reaches the end screen.
// Serve this folder first (python3 -m http.server 8000), then:
//   node tests/playthrough.cjs <screenshot-dir> [width] [height] [max-ms] [url]
// Needs `playwright` (Chromium). It tops the hero up below 50 hp so a stray slam cannot end the probe.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const W = +(process.argv[3] || 960), H = +(process.argv[4] || 540);
const MAX_MS = +(process.argv[5] || 600000);
const URL = process.argv[6] || 'http://127.0.0.1:8000/index.html';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.addInitScript(() => { window.__fr = 0; (function f() { window.__fr++; requestAnimationFrame(f); })(); });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dungeon, null, { timeout: 60000 });
  console.log('title ready ms', Date.now() - t0);
  await page.evaluate(() => { window.__dungeon.game.bloom.enabled = false; window.__dungeon.game.quality = 0; });
  await page.screenshot({ path: `${OUT}/bot_title.png` });
  await page.click('#play');
  const held = new Set();
  const keyFor = { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS' };
  async function setKeys(want) {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  }
  const snap = () => page.evaluate(() => {
    const d = window.__dungeon, g = d.game, L = g.level, GS = d.GameState;
    if (!L) return { mode: g.mode };
    const pr = (v) => { const p = v.clone().project(g.camera); const r = g.canvas.getBoundingClientRect(); return [ (p.x * 0.5 + 0.5) * r.width + r.left, (-p.y * 0.5 + 0.5) * r.height + r.top ]; };
    return {
      mode: g.mode, state: L.state, floor: L.floorIndex, hp: GS.hp, weapon: GS.weaponId, gold: GS.gold,
      hero: [g.hero.pos.x, g.hero.pos.z], door: [L.doorX, L.half[1]],
      foes: L.enemies().map((e) => ({ x: e.pos.x, z: e.pos.z, s: pr(e.pos.clone().setY(0.8)), hp: e.hp, st: e.state, role: e.role, down: e.state !== 'chase' })),
      chests: L.chests.filter((c) => !c.gone && !c.opened).map((c) => ({ x: c.pos.x, z: c.pos.z, iron: c.iron })),
      ped: L.pedestal && !L.pedestal.taken ? { x: L.pedestal.basePos.x, z: L.pedestal.basePos.z, near: L.pedestal.near(g.hero.pos) } : null,
      frames: window.__fr, events: GS.events.length,
    };
  });
  const shots = new Set();
  const shot = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${OUT}/bot_${name}.png` }); };
  let last = null, stuck = 0, iter = 0, lastEvt = 0;
  const start = Date.now();
  while (Date.now() - start < MAX_MS) {
    const s = await snap();
    if (s.mode === 'end') break;
    if (s.mode !== 'playing') { await page.waitForTimeout(100); continue; }
    iter++;
    // keep the hero topped up so a probe cannot die to a stray slam (like the Godot autoplay)
    if (s.hp < 50) await page.evaluate(() => { window.__dungeon.GameState.hp = window.__dungeon.GameState.maxHp; });
    const [hx, hz] = s.hero;
    const want = new Set();
    const go = (tx, tz, tol = 0.25) => { const dx = tx - hx, dz = tz - hz; if (dx > tol) want.add(keyFor.r); if (dx < -tol) want.add(keyFor.l); if (dz > tol) want.add(keyFor.d); if (dz < -tol) want.add(keyFor.u); };
    if (s.state === 'fighting') {
      const alive = s.foes.filter((f) => !f.down).sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz));
      const t = alive[0] || s.foes[0];
      if (t) {
        const dist = Math.hypot(t.x - hx, t.z - hz);
        if (dist > 1.2) go(t.x, t.z, 0.3);
        await page.mouse.move(t.s[0], t.s[1]);
        if (dist < 2.0) { await page.mouse.down(); await page.mouse.up(); }
      }
      if (s.floor === 0) await shot('floor1_fight');
      if (s.floor === 1) await shot('floor2_fight');
      if (s.floor === 2 && s.foes.some((f) => f.role === 'bone_warden')) await shot('boss_fight');
    } else if (s.state === 'cleared') {
      await shot(`cleared_${s.floor}`);
      if (s.chests.length) {
        const c = s.chests[0];
        const dist = Math.hypot(c.x - hx, c.z - hz);
        if (dist > 1.0) go(c.x, c.z, 0.2); else { await setKeys(new Set()); await page.keyboard.press('KeyE'); }
      } else {
        go(s.door[0], s.door[1] + 1.2, 0.15);
      }
    } else if (s.state === 'pedestal') {
      await shot('pedestal');
      if (s.ped) {
        const tx = s.ped.x - 1.4, tz = s.ped.z + 0.8;
        const dist = Math.hypot(tx - hx, tz - hz);
        if (dist > 0.35) go(tx, tz, 0.15); else { await setKeys(new Set()); await page.keyboard.press('KeyE'); }
      }
    }
    await setKeys(want);
    await page.waitForTimeout(60);
    if (Date.now() - lastEvt > 15000) { lastEvt = Date.now(); console.log(`t=${((Date.now() - start) / 1000).toFixed(0)}s`, JSON.stringify({ st: s.state, fl: s.floor, hp: s.hp, foes: s.foes.length, fr: s.frames, gold: s.gold, wpn: s.weapon })); }
  }
  await setKeys(new Set());
  await page.waitForTimeout(1500);
  const fin = await page.evaluate(() => ({ mode: window.__dungeon.game.mode, ev: window.__dungeon.GameState.events, deaths: window.__dungeon.GameState.deaths, kills: window.__dungeon.GameState.kills, frames: window.__fr }));
  console.log('FINAL', fin.mode, 'deaths', fin.deaths, 'kills', JSON.stringify(fin.kills), 'frames', fin.frames, 'elapsed s', ((Date.now() - start) / 1000).toFixed(0));
  console.log(fin.ev.filter((e) => /floor_|boss|upgrade|level_|run_/.test(e)).join('\n'));
  await page.screenshot({ path: `${OUT}/bot_end.png` });
  console.log(logs.filter((l) => !/PCFSoft/.test(l)).join('\n') || '(no console output)');
  await browser.close();
})();
