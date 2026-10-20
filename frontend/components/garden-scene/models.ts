import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PlotKind } from '@/lib/crop-kinds';
import { addBedSurface } from './field-landscape';
import { type GardenPlot, type GardenWeather } from './types';

function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  material: THREE.Material,
  segments = 5,
) {
  return new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, segments, radius),
    material,
  );
}

export function addManagedBed(
  scene: THREE.Scene,
  slot: { id: string; x: number; z: number; width: number; depth: number },
  plot: GardenPlot,
  cropGroups: THREE.Group[],
) {
  const group = new THREE.Group();
  group.position.set(slot.x, 0, slot.z);
  scene.add(group);

  const soil = addBedSurface(
    group,
    slot.width,
    slot.depth,
    plot.health === '留意',
  );
  soil.userData.plotId = plot.id;

  const halo = roundedBox(
    slot.width + 0.28,
    0.035,
    slot.depth + 0.28,
    0.14,
    new THREE.MeshBasicMaterial({
      color: 0xf3cf68,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
    5,
  );
  halo.position.y = 0.61;
  halo.visible = false;
  group.add(halo);
  const outlineGeometry = new RoundedBoxGeometry(
    slot.width + 0.32,
    0.4,
    slot.depth + 0.32,
    5,
    0.15,
  );
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(outlineGeometry),
    new THREE.LineBasicMaterial({
      color: 0xf3cf68,
      transparent: true,
      opacity: 0.98,
    }),
  );
  outlineGeometry.dispose();
  outline.position.y = 0.37;
  outline.visible = false;
  group.add(outline);

  const crops = new THREE.Group();
  crops.position.y = 0.56;
  crops.userData.phase = slot.x * 0.12 + slot.z * 0.2;
  group.add(crops);
  cropGroups.push(crops);
  const segments =
    plot.segments ??
    (plot.crop && plot.crop !== '休耕'
      ? [
          {
            lengthM: slot.width,
            crop: plot.crop,
            kind: plot.kind,
            stage: plot.stage ?? '生长期',
          },
        ]
      : []);
  let nextX = -slot.width / 2;
  for (const [index, segment] of segments.entries()) {
    const length = Math.min(segment.lengthM, slot.width / 2 - nextX);
    if (length <= 0) break;
    if (index > 0) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.04, slot.depth * 0.78),
        new THREE.MeshStandardMaterial({ color: 0xa68a5c, roughness: 1 }),
      );
      divider.position.set(nextX, 0.035, 0);
      crops.add(divider);
    }
    if (segment.crop && segment.crop !== '休耕') {
      const section = new THREE.Group();
      section.position.x = nextX + length / 2;
      crops.add(section);
      addCropRows(
        section,
        segment.kind,
        length,
        slot.depth,
        segment.stage,
        plot.progress,
      );
    }
    nextX += length;
  }
  return { soil, outline, halo, group };
}

export function createNightSky() {
  const count = 96;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = THREE.MathUtils.randFloat(-38, 38);
    positions[index * 3 + 1] = THREE.MathUtils.randFloat(10, 28);
    positions[index * 3 + 2] = THREE.MathUtils.randFloat(-30, 32);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xfff3c4,
      size: 0.16,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
}

export function createWeatherEffects(scene: THREE.Scene) {
  const count = 420;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = THREE.MathUtils.randFloat(-17, 17);
    positions[index * 3 + 1] = THREE.MathUtils.randFloat(0, 18);
    positions[index * 3 + 2] = THREE.MathUtils.randFloat(-13, 13);
    speeds[index] = THREE.MathUtils.randFloat(13, 21);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xd4f0f4,
      size: 0.1,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  rain.visible = false;
  scene.add(rain);
  const mist = [-8, 0, 8].map((x, index) => {
    const sprite = createMistSprite();
    sprite.position.set(x, 3.2 + index * 0.8, -2 + index * 3.5);
    sprite.scale.set(16, 6, 1);
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  });
  return { rain, rainPositions: positions, rainSpeeds: speeds, mist };
}

export function animateWeather(
  effects: ReturnType<typeof createWeatherEffects>,
  weather: GardenWeather,
  delta: number,
  elapsed: number,
) {
  if (weather === 'rain') {
    for (let index = 0; index < effects.rainSpeeds.length; index += 1) {
      const yIndex = index * 3 + 1;
      effects.rainPositions[yIndex] -= effects.rainSpeeds[index] * delta;
      effects.rainPositions[index * 3] -= delta * 1.4;
      if (effects.rainPositions[yIndex] < -0.3) {
        effects.rainPositions[yIndex] = THREE.MathUtils.randFloat(13, 20);
        effects.rainPositions[index * 3] = THREE.MathUtils.randFloat(-17, 17);
        effects.rainPositions[index * 3 + 2] = THREE.MathUtils.randFloat(
          -13,
          13,
        );
      }
    }
    (
      effects.rain.geometry.attributes.position as THREE.BufferAttribute
    ).needsUpdate = true;
  }
  if (weather === 'mist') {
    effects.mist.forEach((sprite, index) => {
      sprite.position.x =
        -8 + index * 8 + Math.sin(elapsed * 0.12 + index) * 3.5;
      (sprite.material as THREE.SpriteMaterial).opacity =
        0.38 + Math.sin(elapsed * 0.28 + index) * 0.09;
    });
  }
}

function createMistSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 32, 4, 64, 32, 58);
    gradient.addColorStop(0, 'rgba(248,255,248,.78)');
    gradient.addColorStop(1, 'rgba(248,255,248,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
    }),
  );
}

export function loadFarmHelper(parent: THREE.Group, fallback: THREE.Group) {
  new GLTFLoader().load(
    '/models/farm-helper.glb',
    (gltf) => {
      if (parent.userData.disposed) {
        gltf.scene.traverse(disposeObject);
        return;
      }
      parent.remove(fallback);
      fallback.traverse(disposeObject);
      const model = gltf.scene;
      fitModelHeight(model, 1.62);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      const straw = new THREE.MeshStandardMaterial({
        color: 0xd9a83e,
        roughness: 0.9,
        flatShading: true,
      });
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.33, 8), straw);
      hat.position.y = 1.63;
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 0.07, 16),
        straw,
      );
      brim.position.y = 1.48;
      parent.add(model, brim, hat);
    },
    undefined,
    () => undefined,
  );
}

export function loadFox(
  parent: THREE.Group,
  fallback: THREE.Group,
  setMixer: (mixer: THREE.AnimationMixer) => void,
) {
  new GLTFLoader().load(
    '/models/garden-fox.glb',
    (gltf) => {
      if (parent.userData.disposed) {
        gltf.scene.traverse(disposeObject);
        return;
      }
      parent.remove(fallback);
      fallback.traverse(disposeObject);
      const model = gltf.scene;
      fitModelHeight(model, 0.62);
      model.rotation.y = Math.PI;
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      parent.add(model);
      const mixer = new THREE.AnimationMixer(model);
      const clip =
        gltf.animations.find((item) => /walk|run/i.test(item.name)) ??
        gltf.animations[0];
      if (clip) mixer.clipAction(clip).play();
      setMixer(mixer);
    },
    undefined,
    () => undefined,
  );
}

export function animateFox(fox: THREE.Group, elapsed: number) {
  fox.position.set(
    10.3 + Math.cos(elapsed * 0.24) * 2.2,
    0,
    4.65 + Math.sin(elapsed * 0.24) * 1.75,
  );
  fox.rotation.y = -elapsed * 0.24 + Math.PI / 2;
}

function fitModelHeight(model: THREE.Object3D, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(targetHeight / Math.max(size.y, 0.001));
  const scaledBox = new THREE.Box3().setFromObject(model);
  model.position.y -= scaledBox.min.y;
}

export function createFarmerFallback() {
  const farmer = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({
    color: 0xf0bc8d,
    roughness: 0.86,
    flatShading: true,
  });
  const shirt = new THREE.MeshStandardMaterial({
    color: 0x4b89c8,
    roughness: 0.9,
    flatShading: true,
  });
  const pants = new THREE.MeshStandardMaterial({
    color: 0x466443,
    roughness: 0.9,
    flatShading: true,
  });
  const straw = new THREE.MeshStandardMaterial({
    color: 0xe6bb49,
    roughness: 0.9,
    flatShading: true,
  });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.5, 4, 8),
    shirt,
  );
  body.position.y = 0.92;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 7), skin);
  head.position.y = 1.48;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.25, 8), straw);
  hat.position.y = 1.78;
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.47, 0.06, 12),
    straw,
  );
  brim.position.y = 1.62;
  [-0.15, 0.15].forEach((x) => {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.46, 3, 6),
      pants,
    );
    leg.position.set(x, 0.3, 0);
    farmer.add(leg);
  });
  farmer.add(body, head, hat, brim);
  return farmer;
}

export function createFoxFallback() {
  const fox = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({
    color: 0xd66d35,
    roughness: 0.85,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x563928,
    roughness: 0.9,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 5), orange);
  body.scale.set(1.45, 0.78, 0.82);
  body.position.y = 0.34;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 5), orange);
  head.rotation.z = Math.PI / 2;
  head.position.set(0.46, 0.45, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.9, 5), orange);
  tail.rotation.z = -Math.PI / 2.5;
  tail.position.set(-0.52, 0.5, 0);
  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5), dark);
  tailTip.rotation.z = -Math.PI / 2.5;
  tailTip.position.set(-0.84, 0.78, 0);
  fox.add(body, head, tail, tailTip);
  return fox;
}

function addCropRows(
  group: THREE.Group,
  kind: PlotKind,
  width: number,
  depth: number,
  stage = '生长期',
  progress = 40,
) {
  const seeded = stage === '播种期';
  const seedling = ['育苗期', '幼苗期', '出苗期', '定植期'].includes(stage);
  const growth = seedling ? 0.3 : Math.max(0.55, progress / 100);
  const flowering = stage === '开花期';
  const fruiting = ['结果期', '转色期', '采收期', '成熟期', '结荚期'].includes(
    stage,
  );
  if (kind === 'loofah' && !seeded && !seedling && width >= 1.3) {
    addTrellis(group, width, depth, flowering, fruiting);
    return;
  }
  const lines = depth < 1.5 ? 1 : 2;
  const plantsPerLine = Math.max(
    1,
    Math.min(12, Math.round(width / (kind === 'corn' ? 0.9 : 0.65))),
  );
  for (let row = 0; row < lines; row += 1) {
    for (let column = 0; column < plantsPerLine; column += 1) {
      const x =
        ((column + 0.5) / plantsPerLine - 0.5) * Math.max(0.1, width - 0.3);
      const z = ((row + 0.5) / lines - 0.5) * Math.max(0.1, depth - 0.2);
      if (seeded) {
        const seed = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 5, 4),
          new THREE.MeshStandardMaterial({ color: 0xcab184, roughness: 1 }),
        );
        seed.position.set(x, 0.015, z);
        seed.scale.y = 0.4;
        group.add(seed);
        continue;
      }
      const plant = new THREE.Group();
      plant.position.set(x, 0, z);
      plant.scale.setScalar((kind === 'corn' ? 1.05 : 0.8) * growth);
      group.add(plant);
      if (
        [
          'leafy',
          'loofah',
          'root',
          'cabbage',
          'herb',
          'mushroom',
          'flower',
          'tuber',
        ].includes(kind)
      )
        addLettuce(plant, 0, 0, 0.9 + ((row + column) % 3) * 0.1);
      if (kind === 'legume')
        addLegume(plant, 0, 0, row + column, flowering, fruiting, stage);
      if (['tomato', 'pepper', 'strawberry'].includes(kind))
        addTomato(plant, 0, 0, row + column, flowering, fruiting, stage);
      if (kind === 'corn') addCorn(plant, row + column, flowering, fruiting);
      if (kind === 'scallion') addScallions(plant, 0, 0, row + column);
    }
  }
}

function addCorn(
  group: THREE.Group,
  seed: number,
  flowering: boolean,
  fruiting: boolean,
) {
  const green = new THREE.MeshStandardMaterial({
    color: 0x447943,
    roughness: 0.91,
    side: THREE.DoubleSide,
  });
  const lightGreen = new THREE.MeshStandardMaterial({
    color: 0x5e9149,
    roughness: 0.91,
    side: THREE.DoubleSide,
  });
  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.062, 1.46, 6),
    green,
  );
  stalk.position.y = 0.73;
  stalk.castShadow = true;
  group.add(stalk);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i % 2 ? Math.PI : 0) + seed * 0.27 + i * 0.12;
    const height = 0.28 + i * 0.19;
    const length = 0.58 - i * 0.035;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0,
          height,
          0,
          length * 0.46,
          height + 0.16,
          -0.11,
          length,
          height - 0.14,
          0,
          length * 0.46,
          height + 0.16,
          0.11,
        ],
        3,
      ),
    );
    geometry.setIndex([0, 1, 3, 1, 2, 3]);
    geometry.computeVertexNormals();
    const leaf = new THREE.Mesh(geometry, i % 2 ? lightGreen : green);
    leaf.rotation.y = angle;
    leaf.castShadow = true;
    group.add(leaf);
  }
  if (flowering || fruiting) {
    const tassel = new THREE.Mesh(
      new THREE.ConeGeometry(0.095, 0.34, 5),
      new THREE.MeshStandardMaterial({
        color: 0xc5ad62,
        roughness: 1,
        flatShading: true,
      }),
    );
    tassel.position.y = 1.56;
    group.add(tassel);
  }
  if (fruiting) {
    const cob = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.075, 0.2, 3, 5),
      new THREE.MeshStandardMaterial({ color: 0xacc167, roughness: 0.94 }),
    );
    cob.rotation.z = 0.43;
    cob.position.set(0.13, 0.95, 0);
    group.add(cob);
  }
}

function addLettuce(group: THREE.Group, x: number, z: number, scale: number) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  plant.scale.setScalar(scale);
  const colors = [0x79b84b, 0x8dc958, 0x5f9d3e];
  for (let index = 0; index < 7; index += 1) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 7, 5),
      new THREE.MeshStandardMaterial({
        color: colors[index % colors.length],
        roughness: 0.82,
        flatShading: true,
      }),
    );
    const angle = (index / 7) * Math.PI * 2;
    leaf.scale.set(0.86, 0.38, 1.58);
    leaf.rotation.y = -angle;
    leaf.rotation.z = 0.55;
    leaf.position.set(Math.cos(angle) * 0.12, 0.14, Math.sin(angle) * 0.12);
    leaf.castShadow = true;
    plant.add(leaf);
  }
  group.add(plant);
}

function addTomato(
  group: THREE.Group,
  x: number,
  z: number,
  seed: number,
  flowering = false,
  fruiting = true,
  stage = '采收期',
) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c7839,
    roughness: 0.9,
    flatShading: true,
  });
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.055, 0.94, 6),
    stemMaterial,
  );
  stem.position.y = 0.46;
  stem.castShadow = true;
  plant.add(stem);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + seed * 0.35;
    const fruit = new THREE.Mesh(
      new THREE.SphereGeometry(flowering ? 0.065 : 0.12, 8, 6),
      new THREE.MeshStandardMaterial({
        color: flowering
          ? 0xf5cf52
          : stage === '结果期'
            ? 0x8caa4c
            : index % 2
              ? 0xd95836
              : 0xe87537,
        roughness: 0.72,
        flatShading: true,
      }),
    );
    fruit.position.set(
      Math.cos(angle) * 0.2,
      0.36 + (index % 3) * 0.18,
      Math.sin(angle) * 0.2,
    );
    fruit.castShadow = true;
    fruit.visible = flowering || fruiting;
    plant.add(fruit);
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.31, 5),
      stemMaterial,
    );
    leaf.rotation.z = Math.PI / 2;
    leaf.rotation.y = angle;
    leaf.position.set(Math.cos(angle) * 0.18, 0.68, Math.sin(angle) * 0.18);
    plant.add(leaf);
  }
  group.add(plant);
}

function addLegume(
  group: THREE.Group,
  x: number,
  z: number,
  seed: number,
  flowering = false,
  fruiting = true,
  stage = '采收期',
) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  const vineMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f963f,
    roughness: 0.86,
    flatShading: true,
  });
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.045, 0.84, 6),
    vineMaterial,
  );
  stem.position.y = 0.42;
  stem.castShadow = true;
  plant.add(stem);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + seed * 0.3;
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.025, 0.44, 5),
      vineMaterial,
    );
    branch.position.set(
      Math.cos(angle) * 0.16,
      0.52 + (index % 2) * 0.12,
      Math.sin(angle) * 0.16,
    );
    branch.rotation.z = Math.cos(angle) * 0.7;
    branch.rotation.x = Math.sin(angle) * 0.7;
    plant.add(branch);
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 4),
      vineMaterial,
    );
    leaf.scale.set(1.35, 0.28, 0.78);
    leaf.position.set(
      Math.cos(angle) * 0.2,
      0.7 + (index % 2) * 0.1,
      Math.sin(angle) * 0.2,
    );
    leaf.rotation.y = angle;
    plant.add(leaf);
    const pod = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 8, 6),
      new THREE.MeshStandardMaterial({
        color: stage === '结果期' ? 0x93b94d : 0x78a943,
        roughness: 0.72,
        flatShading: true,
      }),
    );
    pod.scale.set(0.5, flowering ? 0.45 : 1.85, 0.5);
    pod.rotation.z = angle + Math.PI / 2;
    pod.position.set(
      Math.cos(angle) * 0.27,
      0.66 + (index % 2) * 0.14,
      Math.sin(angle) * 0.27,
    );
    pod.visible = flowering || fruiting;
    pod.castShadow = true;
    plant.add(pod);
    if (flowering) {
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0xf3d36b, roughness: 0.7 }),
      );
      flower.position.copy(pod.position).add(new THREE.Vector3(0, 0.08, 0));
      plant.add(flower);
    }
  }
  group.add(plant);
}

function addTrellis(
  group: THREE.Group,
  width: number,
  depth: number,
  flowering = false,
  fruiting = true,
) {
  const bamboo = new THREE.MeshStandardMaterial({
    color: 0xa87a45,
    roughness: 0.92,
    flatShading: true,
  });
  const vine = new THREE.MeshStandardMaterial({
    color: 0x4c8e44,
    roughness: 0.86,
    flatShading: true,
  });
  [-width / 2 + 0.5, width / 2 - 0.5].forEach((x) =>
    [-depth / 2 + 0.55, depth / 2 - 0.55].forEach((z) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.065, 2.0, 6),
        bamboo,
      );
      pole.position.set(x, 1, z);
      pole.rotation.z = x < 0 ? -0.06 : 0.06;
      pole.castShadow = true;
      group.add(pole);
    }),
  );
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, width - 0.6, 6),
    bamboo,
  );
  top.position.set(0, 1.82, 0);
  top.rotation.z = Math.PI / 2;
  group.add(top);
  for (let index = 0; index < 7; index += 1) {
    const x = -width / 2 + 0.65 + index * ((width - 1.3) / 6);
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.03, 1.46, 6),
      vine,
    );
    stalk.position.set(x, 0.73, index % 2 ? -0.18 : 0.18);
    group.add(stalk);
    const fruit = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xc9d88d,
        roughness: 0.76,
        flatShading: true,
      }),
    );
    fruit.scale.set(0.68, flowering ? 0.4 : 2.3, 0.68);
    fruit.visible = flowering || fruiting;
    if (flowering)
      (fruit.material as THREE.MeshStandardMaterial).color.set(0xf3d14c);
    fruit.position.set(x + 0.13, 0.86, 0.08);
    fruit.castShadow = true;
    group.add(fruit);
    for (let leafIndex = 0; leafIndex < 3; leafIndex++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 4), vine);
      leaf.scale.set(1.3, 0.23, 1);
      leaf.position.set(
        x + (leafIndex % 2 ? -0.17 : 0.17),
        0.45 + leafIndex * 0.4,
        0.08,
      );
      group.add(leaf);
    }
  }
}

function addScallions(group: THREE.Group, x: number, z: number, seed: number) {
  const clump = new THREE.Group();
  clump.position.set(x, 0, z);
  for (let index = 0; index < 5; index += 1) {
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.036, 0.56 + (index % 2) * 0.08, 6),
      new THREE.MeshStandardMaterial({
        color: index % 2 ? 0x63a642 : 0x83ba4a,
        roughness: 0.85,
        flatShading: true,
      }),
    );
    const angle = (index / 5) * Math.PI * 2 + seed;
    stalk.position.set(Math.cos(angle) * 0.07, 0.28, Math.sin(angle) * 0.07);
    stalk.rotation.z = Math.cos(angle) * 0.1;
    stalk.castShadow = true;
    clump.add(stalk);
  }
  group.add(clump);
}

export function rotateToward(current: number, target: number, maxStep: number) {
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + THREE.MathUtils.clamp(delta, -maxStep, maxStep);
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => disposeObject(object));
}

export function disposeObject(object: THREE.Object3D) {
  if (
    object instanceof THREE.Mesh ||
    object instanceof THREE.LineSegments ||
    object instanceof THREE.Points
  ) {
    object.geometry.dispose();
    (Array.isArray(object.material)
      ? object.material
      : [object.material]
    ).forEach(disposeMaterial);
  }
  if (object instanceof THREE.Sprite) disposeMaterial(object.material);
}

function disposeMaterial(material: THREE.Material) {
  (material as THREE.Material & { map?: THREE.Texture }).map?.dispose();
  material.dispose();
}
