# Dungeon Kit - Level 1 (browser demo)

A playable, one-level port of the voxel-style Dungeon Kit: **Upper Crypts** (floors B1-B3) and the **Bone Warden**.
This is a demo, not the full game: the Flooded Warrens and the later biomes of the Godot game are not included.
Plain static site, no build step: `index.html` + ES modules + assets. Three.js is vendored (no CDN, no network at runtime).

## Run

```
python3 -m http.server 8000      # from this folder, then open http://localhost:8000/
```

## Controls (keyboard and mouse only)

WASD / arrows move, mouse aims, click or J attacks, Space dodge-rolls (i-frames), Q ability (a dodge until Ground Slam is picked),
1 / 2 / 3 potions, E interacts (open chests, take the upgrade), M mutes, Esc pauses. The game also pauses when the window loses focus.

## Embedding

`index.html?embed=1` marks the page as embedded: the end screen shows a **Close** button, and Close (or Esc on the end screen)
calls `parent.postMessage({ type: 'portfolio:close-game' }, '*')`. The host page should focus the iframe after opening it
(`iframe.focus()`) so the keyboard works before the first click. Audio starts only after the player's first click.

## Layout

| Path | What |
| --- | --- |
| `js/main.js` | boot, title / play / end flow, render loop, adaptive quality |
| `js/level.js`, `js/crypts.js` | floor flow, waves, boss, pedestal, camera rig; the Upper Crypts config and layout |
| `js/entities.js`, `js/state.js` | hero, foes, chest, pedestal (numbers ported from the GDScript); run state and weapons |
| `js/vox.js`, `js/models.js`, `js/palette.js` | voxel grid, greedy mesher with baked per-vertex AO, painted models, and palettes |
| `js/world.js`, `js/character.js`, `js/fx.js`, `js/materials.js` | architecture on the 25 cm grid, props, flames, and lights; rigid-part and GLB actors; cube VFX |
| `js/hud.js`, `js/title.js`, `js/audio.js`, `js/input.js` | DOM HUD, title / end diorama, Web Audio sound kit, input |
| `js/vendor/` | three.js r185.1 and the addons it needs |
| `tests/playthrough.cjs` | headless Playwright run with real keyboard and mouse input (see the header of the file) |

See `CREDITS.md` for asset sources and licences.
