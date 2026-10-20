import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  FIELD_COLUMNS,
  FIELD_ROWS,
  LAND_DEPTH_METERS,
  LAND_WIDTH_METERS,
  fieldBedWidth,
  type PlotSlot,
} from './types';

const waterBank = new THREE.MeshStandardMaterial({
  color: 0x514a38,
  roughness: 1,
  side: THREE.DoubleSide,
});
const water = new THREE.MeshStandardMaterial({
  color: 0x567d79,
  metalness: 0.12,
  roughness: 0.52,
  side: THREE.DoubleSide,
});
const footpath = new THREE.MeshStandardMaterial({
  color: 0x87765d,
  roughness: 1,
});
const grass = new THREE.MeshStandardMaterial({
  color: 0x63794a,
  roughness: 1,
  flatShading: true,
});
const pebble = new THREE.MeshStandardMaterial({
  color: 0x695640,
  roughness: 1,
  flatShading: true,
});

function rectangle(
  parent: THREE.Object3D,
  width: number,
  depth: number,
  x: number,
  z: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.018, depth),
    material,
  );
  mesh.position.set(x, 0.15, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function channel(
  scene: THREE.Scene,
  center: (z: number) => number,
  halfWidth: number,
  material: THREE.Material,
  y: number,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const z = -5.95 + (i * 11.9) / 40;
    const x = center(z);
    positions.push(x - halfWidth, y, z, x + halfWidth, y, z);
    if (i < 40) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function earthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#77654e';
  context.fillRect(0, 0, 256, 256);
  let seed = 341981;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 4200; i += 1) {
    context.fillStyle = ['#a18b6b', '#4e4435', '#88765c', '#63724b'][i % 4];
    context.globalAlpha = 0.1 + random() * 0.2;
    const size = 0.5 + random() * 2.4;
    context.fillRect(random() * 256, random() * 256, size, size);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 3);
  texture.anisotropy = 4;
  return texture;
}

export function buildFieldLandscape(scene: THREE.Scene) {
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(LAND_WIDTH_METERS, 0.15, LAND_DEPTH_METERS),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: earthTexture(),
      roughness: 1,
    }),
  );
  surface.position.y = 0.045;
  surface.receiveShadow = true;
  scene.add(surface);

  // Foot room is only a few handspans; the soil rows remain visually continuous.
  rectangle(scene, 0.28, 11.8, -6.4, 0, footpath);
  rectangle(scene, 0.48, 11.8, 2.55, 0, footpath);
  const left = (z: number) =>
    -14.18 + 0.22 * Math.sin(z * 0.52) + 0.13 * Math.sin(z * 1.1);
  channel(scene, left, 0.43, waterBank, 0.153);
  channel(scene, left, 0.25, water, 0.165);
  channel(scene, () => 1.55, 0.43, waterBank, 0.153);
  channel(scene, () => 1.55, 0.23, water, 0.165);

  for (let i = 0; i < 110; i += 1) {
    const u = (Math.sin(i * 127.1) * 43758.5453) % 1;
    const v = (Math.sin(i * 91.73 + 2) * 27493.173) % 1;
    const x = i % 2 ? 14.2 + Math.abs(u) * 1.45 : -15.55 + Math.abs(u) * 0.65;
    const z = -5.7 + Math.abs(v) * 11.4;
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.18 + Math.abs(v) * 0.2, 3),
      grass,
    );
    tuft.position.set(x, 0.22, z);
    tuft.rotation.z = u * 0.3;
    scene.add(tuft);
  }
}

/** Raised earthen ridge with rounded ends and a gently arched cross-section. */
export function addBedSurface(
  group: THREE.Group,
  width: number,
  depth: number,
  unhealthy = false,
) {
  const geometry = new RoundedBoxGeometry(
    width,
    0.34,
    depth,
    6,
    Math.min(0.18, depth * 0.14),
  );
  const points = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors: number[] = [];
  const low = new THREE.Color(0x4f3d2f);
  const high = new THREE.Color(unhealthy ? 0x745039 : 0x745c42);
  const shade = new THREE.Color();
  for (let i = 0; i < points.count; i += 1) {
    const y = points.getY(i);
    const z = points.getZ(i);
    if (y > 0)
      points.setY(i, y + 0.11 * Math.max(0, 1 - (z / (depth * 0.5)) ** 2));
    shade.copy(low).lerp(high, THREE.MathUtils.clamp((y + 0.17) / 0.34, 0, 1));
    const mottling = 0.94 + 0.06 * Math.sin(i * 2.31);
    colors.push(shade.r * mottling, shade.g * mottling, shade.b * mottling);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const soil = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: false,
    }),
  );
  soil.position.y = 0.29;
  soil.castShadow = soil.receiveShadow = true;
  group.add(soil);
  for (let i = 0; i < Math.max(5, Math.round(width * 1.5)); i += 1) {
    const x =
      -width * 0.43 +
      (i / Math.max(1, Math.round(width * 1.5) - 1)) * width * 0.86;
    const z = Math.sin(i * 5.7) * depth * 0.25;
    const clod = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.035 + (i % 3) * 0.009, 0),
      pebble,
    );
    clod.position.set(x, 0.59 - (0.09 * Math.abs(z)) / (depth * 0.5), z);
    group.add(clod);
  }
  return soil;
}

export function addEmptyBed(scene: THREE.Scene, slot: PlotSlot) {
  const group = new THREE.Group();
  group.position.set(slot.x, 0, slot.z);
  scene.add(group);
  addBedSurface(group, slot.width, slot.depth);
  return group;
}

export function sketchSlots(): PlotSlot[] {
  return FIELD_ROWS.flatMap((z, row) =>
    FIELD_COLUMNS.map((x, column) => ({
      id: `sketch-${row}-${column}`,
      x,
      z,
      width: fieldBedWidth(x),
      depth: 1.2,
    })),
  );
}
