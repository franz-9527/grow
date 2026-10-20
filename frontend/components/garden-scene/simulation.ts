import * as THREE from 'three';
import type { InputState } from './types';

const GAME_FORWARD = new THREE.Vector3(0, 0, 1);
const GAME_RIGHT = new THREE.Vector3(-1, 0, 0);
const CAMERA_OFFSET = new THREE.Vector3(0, 5.15, -7.4);
const LOOK_OFFSET = new THREE.Vector3(0, 1.25, 2.5);

export function createInputState(): InputState {
  return { forward: false, backward: false, left: false, right: false };
}

export function installKeyboardSimulation(
  input: InputState,
  isGameMode: () => boolean,
  interact: () => void,
) {
  const keyMap: Record<string, keyof InputState | 'interact' | undefined> = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'backward',
    ArrowDown: 'backward',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    Space: 'interact',
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !isGameMode() ||
      (event.target instanceof HTMLElement &&
        (event.target.closest(
          'input, textarea, select, [role="dialog"], [contenteditable="true"]',
        ) ||
          event.target.isContentEditable))
    )
      return;
    const intent = keyMap[event.code];
    if (!intent) return;
    event.preventDefault();
    if (intent === 'interact') interact();
    else input[intent] = true;
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const intent = keyMap[event.code];
    if (intent && intent !== 'interact') input[intent] = false;
  };
  const reset = () => Object.assign(input, createInputState());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', reset);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', reset);
  };
}

export function updatePlayerSimulation({
  input,
  player,
  playerVisual,
  camera,
  delta,
  elapsed,
  movement,
  desiredCamera,
  cameraLookAt,
  rotateToward,
}: {
  input: InputState;
  player: THREE.Group;
  playerVisual: THREE.Group;
  camera: THREE.PerspectiveCamera;
  delta: number;
  elapsed: number;
  movement: THREE.Vector3;
  desiredCamera: THREE.Vector3;
  cameraLookAt: THREE.Vector3;
  rotateToward: (current: number, target: number, maxStep: number) => number;
}) {
  movement.set(0, 0, 0);
  movement.addScaledVector(
    GAME_RIGHT,
    Number(input.right) - Number(input.left),
  );
  movement.addScaledVector(
    GAME_FORWARD,
    Number(input.forward) - Number(input.backward),
  );
  const moving = movement.lengthSq() > 0;
  if (moving) {
    movement.normalize();
    player.position.addScaledVector(movement, delta * 4.25);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -13.2, 13.2);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -9.2, 9.2);
    player.rotation.y = rotateToward(
      player.rotation.y,
      Math.atan2(movement.x, movement.z),
      delta * 9,
    );
  }
  playerVisual.position.y = moving
    ? Math.abs(Math.sin(elapsed * 9)) * 0.045
    : 0;
  playerVisual.rotation.z = moving ? Math.sin(elapsed * 9) * 0.04 : 0;
  desiredCamera.copy(player.position).add(CAMERA_OFFSET);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 5));
  cameraLookAt.copy(player.position).add(LOOK_OFFSET);
  camera.lookAt(cameraLookAt);
}

export function closestPlot(
  position: THREE.Vector3,
  centers: Map<string, THREE.Vector3>,
  maxDistance = 4.2,
) {
  let closest: string | null = null;
  let distance = maxDistance;
  centers.forEach((center, plotId) => {
    const candidate = position.distanceTo(center);
    if (candidate < distance) {
      closest = plotId;
      distance = candidate;
    }
  });
  return closest;
}
