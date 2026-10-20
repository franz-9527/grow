'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GardenInteraction } from './garden-scene/interaction';
import {
  addEmptyBed,
  buildFieldLandscape,
  sketchSlots,
} from './garden-scene/field-landscape';
import {
  addManagedBed,
  animateFox,
  animateWeather,
  createFarmerFallback,
  createFoxFallback,
  createNightSky,
  createWeatherEffects,
  disposeObject,
  disposeScene,
  loadFarmHelper,
  loadFox,
  rotateToward,
} from './garden-scene/models';
import {
  closestPlot,
  createInputState,
  installKeyboardSimulation,
  updatePlayerSimulation,
} from './garden-scene/simulation';
import {
  PLAYER_START,
  plotSlot,
  type GardenMode,
  type GardenPlot,
  type GardenWeather,
  type InputState,
  type SelectionParts,
} from './garden-scene/types';

export type { GardenMode, GardenPlot, GardenWeather };

type GardenSceneProps = {
  plots: GardenPlot[];
  selectedId: string;
  editMode: boolean;
  mode: GardenMode;
  weather: GardenWeather;
  isDay: boolean;
  landscapeMode?: boolean;
  focusRequest?: number;
  onSelect: (plotId: string) => void;
  onInteract?: (plotId: string) => void;
  onPositionChange?: (plotId: string, x: number, z: number) => void;
};

/** 1 个世界单位 = 1 米：30m × 22m 的核心区约 660m²，接近一亩地。 */
export function GardenScene({
  plots,
  selectedId,
  editMode,
  mode,
  weather,
  isDay,
  landscapeMode = false,
  focusRequest = 0,
  onSelect,
  onInteract,
  onPositionChange,
}: GardenSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputState>(createInputState());
  const selectedRef = useRef(selectedId);
  const editModeRef = useRef(editMode);
  const modeRef = useRef<GardenMode>(mode);
  const weatherRef = useRef<GardenWeather>(weather);
  const isDayRef = useRef(isDay);
  const onSelectRef = useRef(onSelect);
  const onInteractRef = useRef(onInteract);
  const onPositionChangeRef = useRef(onPositionChange);
  const nearbyRef = useRef<string | null>(null);
  const interactionRef = useRef<GardenInteraction | null>(null);
  const [nearbyPlot, setNearbyPlot] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const syncPlotsRef = useRef<(next: GardenPlot[]) => void>(() => {});
  const initialPlots = useRef(plots);
  const lastSelectionRef = useRef(selectedId);
  const lastFocusRequestRef = useRef(focusRequest);

  useEffect(() => {
    selectedRef.current = selectedId;
    const shouldFocus =
      (lastSelectionRef.current !== selectedId &&
        Boolean(lastSelectionRef.current)) ||
      lastFocusRequestRef.current !== focusRequest;
    lastSelectionRef.current = selectedId;
    lastFocusRequestRef.current = focusRequest;
    if (mode === 'manage' && !editMode && shouldFocus)
      interactionRef.current?.focusPlot(selectedId);
  }, [editMode, focusRequest, mode, selectedId]);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);
  useEffect(() => {
    isDayRef.current = isDay;
  }, [isDay]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);
  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  const setMovement = (direction: keyof InputState, active: boolean) => {
    inputRef.current[direction] = active;
  };

  const interact = useCallback(() => {
    const plotId = nearbyRef.current;
    if (!plotId) return;
    onSelectRef.current(plotId);
    onInteractRef.current?.(plotId);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const overviewCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
    const gameCamera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      queueMicrotask(() => setUnavailable(true));
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.domElement.setAttribute(
      'aria-label',
      '可旋转、可漫游的一亩三维菜园',
    );
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const overviewTarget = new THREE.Vector3(0, 0.35, 0);
    overviewCamera.position.set(15, 29, 27);
    overviewCamera.lookAt(overviewTarget);
    const controls = new OrbitControls(overviewCamera, renderer.domElement);
    controls.target.copy(overviewTarget);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.panSpeed = 0.72;
    controls.enableRotate = true;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.85;
    controls.minPolarAngle = 0.48;
    controls.maxPolarAngle = 1.42;
    controls.minDistance = 10;
    controls.maxDistance = 105;
    controls.enabled = modeRef.current === 'manage' && !editModeRef.current;

    const hemi = new THREE.HemisphereLight(0xe7faef, 0x765a48, 2.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe0a9, 3.1);
    sun.position.set(-17, 28, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.00035;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb8e1ff, 0.8);
    fill.position.set(18, 14, -18);
    scene.add(fill);
    const moon = new THREE.DirectionalLight(0x9db9ff, 0);
    moon.position.set(-12, 18, -16);
    scene.add(moon);
    const nightSky = createNightSky();
    nightSky.visible = false;
    scene.add(nightSky);

    const bedMeshes: THREE.Mesh[] = [];
    const plotCenters = new Map<string, THREE.Vector3>();
    const plotGroups = new Map<string, THREE.Group>();
    const selectionParts = new Map<string, SelectionParts>();
    const cropGroups: THREE.Group[] = [];
    buildFieldLandscape(scene);
    const bedGroups: THREE.Group[] = [];
    const emptyBedGroups: THREE.Group[] = [];
    let lastSignature = '';
    syncPlotsRef.current = (nextPlots) => {
      const signature = JSON.stringify(nextPlots);
      if (signature === lastSignature) return;
      lastSignature = signature;
      bedGroups.forEach((group) => {
        group.traverse(disposeObject);
        scene.remove(group);
      });
      emptyBedGroups.forEach((group) => {
        group.traverse(disposeObject);
        scene.remove(group);
      });
      bedGroups.length = 0;
      emptyBedGroups.length = 0;
      bedMeshes.length = 0;
      cropGroups.length = 0;
      plotCenters.clear();
      plotGroups.clear();
      selectionParts.clear();
      nextPlots.forEach((plot, index) => {
        const slot = plotSlot(
          index,
          plot.id,
          nextPlots.length,
          plot.position,
          plot.size,
        );
        plotCenters.set(plot.id, new THREE.Vector3(slot.x, 0, slot.z));
        const built = addManagedBed(scene, slot, plot, cropGroups);
        built.group.userData.plotWidth = slot.width;
        built.group.userData.plotDepth = slot.depth;
        bedGroups.push(built.group);
        bedMeshes.push(built.soil);
        plotGroups.set(plot.id, built.group);
        selectionParts.set(plot.id, {
          outline: built.outline,
          halo: built.halo,
        });
      });
      sketchSlots().forEach((slot) => {
        const occupied = [...plotCenters.values()].some(
          (center) =>
            Math.abs(center.x - slot.x) < 1.65 &&
            Math.abs(center.z - slot.z) < 1.3,
        );
        if (!occupied) emptyBedGroups.push(addEmptyBed(scene, slot));
      });
    };
    syncPlotsRef.current(initialPlots.current);

    const player = new THREE.Group();
    player.position.copy(PLAYER_START);
    scene.add(player);
    const playerVisual = createFarmerFallback();
    player.add(playerVisual);
    loadFarmHelper(player, playerVisual);

    const fox = new THREE.Group();
    scene.add(fox);
    const foxVisual = createFoxFallback();
    fox.add(foxVisual);
    let foxMixer: THREE.AnimationMixer | null = null;
    loadFox(fox, foxVisual, (mixer) => {
      foxMixer = mixer;
    });

    const weatherEffects = createWeatherEffects(scene);
    let appliedLighting = '';
    const applyWeather = (nextWeather: GardenWeather, nextIsDay: boolean) => {
      const lightingKey = `${nextWeather}:${nextIsDay ? 'day' : 'night'}`;
      if (appliedLighting === lightingKey) return;
      appliedLighting = lightingKey;
      const dayPalette =
        nextWeather === 'sunny'
          ? {
              background: 0x9bcfe0,
              near: 65,
              far: 150,
              hemi: 1.7,
              sun: 2.15,
              fill: 0.65,
              exposure: 0.96,
            }
          : nextWeather === 'rain'
            ? {
                background: 0x8ba4aa,
                near: 55,
                far: 130,
                hemi: 1.55,
                sun: 1.25,
                fill: 0.5,
                exposure: 0.92,
              }
            : {
                background: 0xb6d2c9,
                near: 50,
                far: 115,
                hemi: 1.6,
                sun: 1.55,
                fill: 0.6,
                exposure: 0.94,
              };
      if (nextIsDay) {
        scene.background = new THREE.Color(dayPalette.background);
        scene.fog = new THREE.Fog(
          dayPalette.background,
          dayPalette.near,
          dayPalette.far,
        );
        hemi.color.set(0xe7faef);
        hemi.groundColor.set(0x765a48);
        hemi.intensity = dayPalette.hemi;
        sun.color.set(0xffe0a9);
        sun.intensity = dayPalette.sun;
        fill.color.set(0xb8e1ff);
        fill.intensity = dayPalette.fill;
        moon.intensity = 0;
        renderer.toneMappingExposure = dayPalette.exposure;
      } else {
        scene.background = new THREE.Color(0x142b39);
        scene.fog = new THREE.Fog(0x142b39, 55, 125);
        hemi.color.set(0x7898bd);
        hemi.groundColor.set(0x6b5b48);
        hemi.intensity = nextWeather === 'mist' ? 1.45 : 1.3;
        sun.color.set(0x6678a4);
        sun.intensity = nextWeather === 'rain' ? 0.45 : 0.65;
        fill.color.set(0x637fc0);
        fill.intensity = 0.65;
        moon.intensity = nextWeather === 'mist' ? 1.1 : 1.5;
        renderer.toneMappingExposure = 1.05;
      }
      nightSky.visible = !nextIsDay;
      weatherEffects.rain.visible = nextWeather === 'rain';
      weatherEffects.mist.forEach((sprite) => {
        sprite.visible = nextWeather === 'mist';
      });
    };

    const interaction = new GardenInteraction({
      element: renderer.domElement,
      camera: overviewCamera,
      controls,
      bedMeshes,
      plotGroups,
      plotCenters,
      isManageMode: () => modeRef.current === 'manage',
      isEditMode: () => editModeRef.current,
      onSelect: (plotId) => onSelectRef.current(plotId),
      onPositionChange: (plotId, x, z) =>
        onPositionChangeRef.current?.(plotId, x, z),
    });
    interactionRef.current = interaction;

    const removeKeyboard = installKeyboardSimulation(
      inputRef.current,
      () => modeRef.current === 'game',
      interact,
    );

    const cameraLookAt = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const movement = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    const framingRadius = 15.6;
    let elapsed = 0;
    let proximityCheckAt = 0;
    let animationFrame = 0;
    let lastFrameAt = performance.now();
    let lastAspect = 0;

    const overviewDistanceForAspect = (aspect: number) => {
      const verticalFov = THREE.MathUtils.degToRad(overviewCamera.fov);
      const horizontalFov =
        2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.01));
      const verticalDistance = framingRadius / Math.tan(verticalFov / 2);
      const horizontalDistance = framingRadius / Math.tan(horizontalFov / 2);
      return Math.max(verticalDistance, horizontalDistance) * 1.08;
    };

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      const aspect = width / height;
      const orientationChanged =
        lastAspect > 0 &&
        ((lastAspect < 0.9 && aspect > 1.1) ||
          (lastAspect > 1.1 && aspect < 0.9));
      const shouldRefit = lastAspect === 0 || orientationChanged;
      overviewCamera.aspect = aspect;
      overviewCamera.updateProjectionMatrix();
      gameCamera.aspect = aspect;
      gameCamera.updateProjectionMatrix();
      if (shouldRefit) {
        cameraDirection
          .copy(overviewCamera.position)
          .sub(controls.target)
          .normalize();
        overviewCamera.position
          .copy(controls.target)
          .addScaledVector(cameraDirection, overviewDistanceForAspect(aspect));
        controls.minDistance = Math.max(
          10,
          overviewDistanceForAspect(aspect) * 0.28,
        );
        controls.maxDistance = Math.max(
          105,
          overviewDistanceForAspect(aspect) * 2.6,
        );
        controls.update();
      }
      renderer.setSize(width, height, false);
      lastAspect = aspect;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    window.addEventListener('resize', resize);

    const animate = (frameAt: number) => {
      if (document.hidden) {
        lastFrameAt = frameAt;
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }
      const delta = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
      lastFrameAt = frameAt;
      elapsed += delta;
      const gameMode = modeRef.current === 'game';
      player.visible = gameMode;
      fox.visible = gameMode;
      controls.enabled = !gameMode && !editModeRef.current;
      applyWeather(weatherRef.current, isDayRef.current);

      if (gameMode) {
        updatePlayerSimulation({
          input: inputRef.current,
          player,
          playerVisual,
          camera: gameCamera,
          delta,
          elapsed,
          movement,
          desiredCamera,
          cameraLookAt,
          rotateToward,
        });
        if (elapsed > proximityCheckAt) {
          proximityCheckAt = elapsed + 0.16;
          const closest = closestPlot(player.position, plotCenters);
          if (closest !== nearbyRef.current) {
            nearbyRef.current = closest;
            setNearbyPlot(closest);
          }
        }
      } else if (nearbyRef.current !== null) {
        nearbyRef.current = null;
        setNearbyPlot(null);
      }

      if (!gameMode) {
        interaction.update(delta);
        controls.update();
      }
      selectionParts.forEach(({ outline, halo }, plotId) => {
        const active = plotId === selectedRef.current;
        outline.visible = active;
        halo.visible = active;
        const color = editModeRef.current ? 0x72a7ff : 0xf3cf68;
        (outline.material as THREE.LineBasicMaterial).color.set(color);
        (halo.material as THREE.MeshBasicMaterial).color.set(color);
        (halo.material as THREE.MeshBasicMaterial).opacity =
          0.12 + Math.sin(elapsed * 3.4) * 0.035;
        halo.scale.setScalar(1 + Math.sin(elapsed * 3.4) * 0.018);
      });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        cropGroups.forEach((group) => {
          group.rotation.z =
            Math.sin(elapsed * 0.8 + Number(group.userData.phase)) * 0.012;
        });
      animateWeather(weatherEffects, weatherRef.current, delta, elapsed);
      animateFox(fox, elapsed);
      foxMixer?.update(delta);
      renderer.render(scene, gameMode ? gameCamera : overviewCamera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    resize();
    animate(performance.now());

    return () => {
      syncPlotsRef.current = () => {};
      interactionRef.current = null;
      interaction.dispose();
      removeKeyboard();
      player.userData.disposed = true;
      fox.userData.disposed = true;
      foxMixer?.stopAllAction();
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      if (renderer.domElement.parentElement === host)
        host.removeChild(renderer.domElement);
    };
    // The world reads UI state through refs instead of recreating WebGL after each tap.
  }, [interact]);

  useEffect(() => {
    syncPlotsRef.current(plots);
  }, [editMode, mode, plots, selectedId]);

  return (
    <div
      className={`garden-scene-frame relative w-full ${landscapeMode ? 'garden-scene-frame--landscape' : ''}`}
    >
      <div ref={hostRef} className="size-full" />
      {unavailable && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#e8efe4] p-8 text-center text-[#5e7657]">
          设备暂不支持 3D 场景，请使用下方地块卡片继续管理。
        </div>
      )}
      {mode === 'manage' && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-white/55 bg-[#173821]/72 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md sm:bottom-4 sm:left-4">
          {editMode
            ? '编辑布局 · 拖动地块移动 · 松开自动保存'
            : `${isDay ? '白天' : '夜间'} · 左键旋转 · 滚轮缩放 · 右键平移 · 点击地块聚焦`}
        </div>
      )}
      {mode === 'game' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex items-end justify-between p-3 sm:bottom-3 sm:p-4">
          <div className="pointer-events-auto rounded-2xl border border-white/50 bg-[#173821]/78 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md">
            {nearbyPlot
              ? `靠近地块 ${nearbyPlot}，可进行操作`
              : 'WASD / 方向键或触控方向盘移动'}
          </div>
          <div className="pointer-events-auto ml-3 flex items-end gap-2">
            <div className="grid grid-cols-3 gap-1.5" aria-label="移动方向">
              <span />
              <MoveButton
                label="向上移动"
                onChange={(active) => setMovement('forward', active)}
              >
                ↑
              </MoveButton>
              <span />
              <MoveButton
                label="向左移动"
                onChange={(active) => setMovement('left', active)}
              >
                ←
              </MoveButton>
              <MoveButton
                label="向下移动"
                onChange={(active) => setMovement('backward', active)}
              >
                ↓
              </MoveButton>
              <MoveButton
                label="向右移动"
                onChange={(active) => setMovement('right', active)}
              >
                →
              </MoveButton>
            </div>
            <button
              type="button"
              disabled={!nearbyPlot}
              onClick={interact}
              className="min-h-14 rounded-2xl border border-[#f7e6a6]/70 bg-[#f4b940] px-4 text-sm font-black text-[#543516] shadow-[0_8px_0_#b56c1e] transition active:translate-y-1 active:shadow-[0_3px_0_#b56c1e] disabled:cursor-not-allowed disabled:opacity-45"
            >
              操作
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MoveButton({
  label,
  onChange,
  children,
}: {
  label: string;
  onChange: (active: boolean) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(true);
      }}
      onPointerUp={(event) => {
        onChange(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => onChange(false)}
      onLostPointerCapture={() => onChange(false)}
      className="grid size-11 place-items-center rounded-xl border border-white/35 bg-[#224a2d]/86 text-xl font-bold text-white shadow-md backdrop-blur-md active:scale-95"
    >
      {children}
    </button>
  );
}
