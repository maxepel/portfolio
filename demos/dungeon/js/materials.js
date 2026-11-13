// Shared materials for the voxel meshes. Vertex colour = palette x baked AO (linear).
import * as THREE from 'three';
import { SOLID, WATER, GLOW, METAL, JELLY } from './vox.js';

const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
const metal = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: new THREE.Color(0.24, 0.25, 0.28) });
// Emissive voxels (flames, eyes, runes): colour above 1.0 so only these bloom.
const glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3, 3, 3), fog: false });

export const SHARED = { [SOLID]: solid, [WATER]: solid, [JELLY]: solid, [METAL]: metal, [GLOW]: glow };

// Fresh copies for one actor so a hit flash can tint it alone.
export function actorMaterials() {
  const s = solid.clone(), m = metal.clone();
  return { [SOLID]: s, [WATER]: s, [JELLY]: s, [METAL]: m, [GLOW]: glow, flashable: [s, m] };
}

// A flame material that flickers (colour energy driven each frame by the owner).
export function flameMaterial(energy = 4) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(energy, energy, energy), fog: false });
  m.userData.energy = energy;
  return m;
}
