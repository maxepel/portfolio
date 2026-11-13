// Indexed palette of the Voxel style (Upper Crypts). [sRGB hex, class]
// classes: 0 solid, 1 water, 2 glow, 3 metal, 4 jelly.
import { makePalette } from './vox.js';

const PAL_COMMON = {
  bone: ['e8dfc4', 0], bone2: ['cfc4a4', 0], bone3: ['a89c7e', 0], socket: ['1c1a22', 0],
  eye_g: ['7cf2b0', 2], eye_g2: ['3fbf86', 2], eye_r: ['ff4a3a', 2], eye_y: ['ffd04a', 2], eye_c: ['5cf6ff', 2],
  iron: ['4f5462', 3], iron2: ['6a7183', 3], iron3: ['363944', 3], rust: ['8a5a3a', 0],
  steel: ['d4dbe6', 3], steel2: ['9aa4b4', 3], gold: ['ffc44a', 3], gold2: ['d99a2a', 3],
  wood: ['8a5a34', 0], wood2: ['74492b', 0], wood3: ['5e3b22', 0], plank: ['a8743e', 0],
  leather: ['6b3f24', 0], cloth_r: ['a83a3a', 0], cloth_r2: ['7f2a30', 0],
  white: ['f6f3ec', 0], pupil: ['2a2230', 0], hl: ['ffffff', 0],
  teeth: ['f4efe0', 0], mouth: ['3a1820', 0], tongue: ['c8505a', 0],
  bat: ['5a4870', 0], bat2: ['453658', 0], batw: ['6e5288', 0], batw2: ['2c2236', 0], batear: ['b07a9a', 0],
  wax: ['efe4c8', 0], wax2: ['d8caa6', 0], coal: ['2a2420', 0], ember: ['ff7a2a', 2],
  flame_g: ['5cf2a0', 2], flame_g2: ['d0ffe8', 2], flame_a: ['ff9a3a', 2], flame_a2: ['ffe08a', 2],
  flame_c: ['ffb347', 2], flame_c2: ['fff0b0', 2], rune: ['5cf6ff', 2],
};

const PAL_CRYPTS = {
  fl1: ['525b70', 0], fl2: ['4a5367', 0], fl3: ['434b5e', 0], fl4: ['5b6479', 0], fld: ['383e4d', 0], bas: ['2e3340', 0],
  wl1: ['5d6780', 0], wl2: ['545d75', 0], wl3: ['4b536a', 0], wld: ['3b4254', 0],
  wt1: ['7a849e', 0], wt2: ['6c7690', 0], pl1: ['68728c', 0], pl2: ['5c6680', 0],
  st1: ['7e869a', 0], st2: ['6a7286', 0], st3: ['565e72', 0], st4: ['9098ac', 0],
  lichen: ['5f7f72', 0],
};

export const PAL = makePalette([PAL_COMMON, PAL_CRYPTS]);

// Biome colours used by lights, fog, and the HUD (sRGB hex).
export const COLORS = {
  bg: 0x07080d, ambient: 0x3a4562, fog: 0x141a26, torch: 0x5cf2a0,
  bone: 0xe8dfc4, gold: 0xffc44a, danger: 0xff3b30, accent: 0x5cf6ff,
};
