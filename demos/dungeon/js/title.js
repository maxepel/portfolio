// Title / end card backdrop: a small voxel diorama behind the text, long lens
// (port of VoxelStyle.menu_backdrop, crypts version).
import * as THREE from 'three';
import { toGeometries, Noise } from './vox.js';
import { PAL, COLORS } from './palette.js';
import { addPiece, makeProp, omni, Flicker } from './world.js';
import { meshesFor, VoxCharacter, VoxHero } from './character.js';
import { SHARED } from './materials.js';

export class TitleScene {
  constructor(heroAsset) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.006);
    this.flicker = new Flicker();
    const noises = { floor: new Noise(7), wall: new Noise(3) };
    const parts = {};
    addPiece(parts, 'floor', [0, -0.1, 0], [12, 0.2, 8], noises);
    addPiece(parts, 'wall', [0, 1.8, -3.5], [12, 3.6, 1.0], noises);
    const room = meshesFor(toGeometries(parts), SHARED);
    this.scene.add(room);
    this.scene.add(new THREE.AmbientLight(COLORS.ambient, 0.7 * Math.PI));
    for (const x of [-3.0, 3.0]) {
      const t = makeProp('torch', this.flicker);
      t.position.set(x, 2.2, -2.95);
      this.scene.add(t);
      const l = omni(COLORS.torch, 2.4, 7.0);
      l.position.set(x, 2.4, -2.5);
      this.scene.add(l);
    }
    const warm = omni(0xffc890, 1.4, 6.0);
    warm.position.set(0.0, 1.8, 2.0);
    this.scene.add(warm);
    this.chars = [];
    const add = (c, pos, face) => {
      c.root.position.set(...pos);
      this.scene.add(c.root);
      c.faceNow(new THREE.Vector3(...face));
      c.play('idle');
      this.chars.push(c);
    };
    add(new VoxHero(heroAsset, () => 'sword'), [-2.5, 0, 0.6], [0.5, 0, 1]);
    add(new VoxCharacter('skeleton'), [2.5, 0, -0.2], [-1, 0, 0.6]);
    add(new VoxCharacter('bat'), [-4.2, 1.5, -0.8], [1, 0, 1]);
    for (const [kind, pos, yaw] of [['chest', [4.3, 0, 0.6], -0.5], ['skull', [1.4, 0, 1.7], 0.6], ['bones', [-1.0, 0, 1.6], 0.0]]) {
      const p = makeProp(kind, this.flicker);
      p.position.set(...pos);
      p.rotation.y = yaw;
      this.scene.add(p);
    }
    this.camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.1, 150);
    const target = new THREE.Vector3(0, 0.9, -1.5);
    const dir = new THREE.Vector3(0, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)).multiplyScalar(16);
    this.camera.position.copy(target).add(dir);
    this.camera.lookAt(target);
    this.baseFov = 24;
  }

  update(dt, time) {
    for (const c of this.chars) c.update(dt);
    this.flicker.update(dt, time);
  }
}
