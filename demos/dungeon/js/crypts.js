// Upper Crypts (B1-B3): the tutorial biome. Config ported from the Godot kit's
// levels/crypts.gd (enemy numbers are 2D px; the core divides by 48), layout from the
// lab remake: four sarcophagi with candles, two statues at the back, a fire pit,
// green spirit torches, bones. Floors 1-2: skeletons (reanimate once) + bats, 1-2 waves.
// Floor 3: Bone Warden. Upgrade: Warhammer vs Dual Daggers.
import { Rng } from './models.js';
import { TAU } from './util.js';

export const CRYPTS_CONFIG = {
  biome_id: 'crypts',
  biome_name: 'Upper Crypts',
  floor_prefix: 'B',
  floor_start: 1,
  floors: 3, // B1, B2, then the Bone Warden on B3; beating him wins the demo
  ambience: ['hit_bone', 'creak', 'chain'],
  intro_bark: 'Oh good, chores.',
  floor_barks: [
    'Oh good, chores.',
    "A hero's helmet in the wall. Guess he didn't make rent either.",
    'Big door. Big thing behind it, probably.',
  ],
  enemy_pool: [
    { kind: 'skeleton', hp: 20, damage: 5, speed: 58.0, radius: 14.0, reanimates: true, gold: 4 },
    { kind: 'bat', hp: 12, damage: 5, speed: 95.0, radius: 10.0, gold: 3 },
  ],
  boss: { kind: 'skeleton', role: 'bone_warden', boss: true, hp: 120, damage: 8, speed: 72.0, radius: 24.0, slam: 20, slam_radius: 120.0, gold: 45 },
  boss_name: 'BONE WARDEN',
  boss_adds: 2,
  clear_bark: "Down you go. That's a tooth— no, you're fine.",
  upgrades: [
    { name: 'Warhammer', id: 'warhammer', kind: 'weapon', desc: 'Slow, heavy, stunning' },
    { name: 'Dual Daggers', id: 'daggers', kind: 'weapon', desc: 'Fast, light, flurry' },
  ],
  water_tick: 1.5,
  water_damage: 2,
};

export function cryptsLayout() {
  const hx = 10.83, hz = 5.21;
  const tombs = [[-7.08, 0, -3.96], [7.08, 0, -3.96], [-7.08, 0, 2.29], [7.08, 0, 2.29]];
  const props = [], candles = [], avoid = [];
  for (const t of tombs) {
    props.push({ kind: 'sarcophagus', pos: t, yaw: 0, solid: [1.0, 1.0, 2.2] });
    candles.push([t[0] + 0.2, t[1] + 0.98, t[2] - 0.75]);
    avoid.push({ pos: [t[0], t[2]], r: 1.7 });
  }
  for (const x of [-4.6, 4.6]) {
    props.push({ kind: 'statue', pos: [x, 0, -hz + 0.9], solid: [1.2, 2.0, 1.1] });
    avoid.push({ pos: [x, -hz + 0.9], r: 1.2 });
  }
  props.push({ kind: 'fire_pit', pos: [0, 0, -4.5], solid: [1.4, 0.5, 1.4] });
  avoid.push({ pos: [0, -4.5], r: 1.3 });
  props.push({ kind: 'barrel', pos: [hx - 0.7, 0, 1.6], yaw: 0.4, solid: [0.7, 1.0, 0.7] });
  props.push({ kind: 'barrel', pos: [hx - 1.4, 0, 2.3], yaw: 1.2, solid: [0.7, 1.0, 0.7] });
  avoid.push({ pos: [hx - 1.0, 1.9], r: 1.2 });
  const rng = new Rng(7);
  for (let i = 0; i < 12; i++) {
    const p = [rng.range(-hx + 0.8, hx - 0.8), 0, rng.range(-hz + 0.8, hz - 0.8)];
    if (Math.abs(p[0]) < 2.5 && p[2] > 1.0) continue;
    props.push({ kind: i % 3 === 0 ? 'bones' : 'skull', pos: p, yaw: rng.randf() * TAU });
  }
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    props.push({ kind: 'debris', pos: [cx * (hx - 0.9), 0, cz * (hz - 0.8)], yaw: rng.randf() * TAU });
  return {
    half: [hx, hz],
    door_x: -0.83,
    hero_start: [0, 0, 2.92],
    boss_spawn: [0, 0, -2.4],
    pedestal_at: [0, 0, -0.6],
    pillars: [[-9.0, -hz + 0.2], [-2.4, -hz + 0.2], [2.4, -hz + 0.2], [9.0, -hz + 0.2]],
    props,
    candles,
    torches: [[-hx + 0.35, 2.2, -4.0], [hx - 0.35, 2.2, -4.0], [-hx + 0.35, 2.2, 3.6], [hx - 0.35, 2.2, 3.6], [-1.2, 2.2, -hz + 0.35], [1.2, 2.2, -hz + 0.35]],
    avoid,
  };
}
