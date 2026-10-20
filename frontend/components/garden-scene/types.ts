import * as THREE from 'three';
import type { PlotKind } from '@/lib/crop-kinds';

export type GardenPlot = {
  id: string;
  kind: PlotKind;
  health: '良好' | '留意';
  position?: { x: number; z: number };
  size?: { width: number; depth: number };
  segments?: Array<{
    lengthM: number;
    crop: string;
    kind: PlotKind;
    stage: string;
  }>;
  crop?: string;
  stage?: string;
  progress?: number;
  plantCount?: number;
};

export type GardenMode = 'manage' | 'game';
export type GardenWeather = 'sunny' | 'rain' | 'mist';

export type InputState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

export type SelectionParts = {
  outline: THREE.LineSegments;
  halo: THREE.Mesh;
};

export type PlotSlot = {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
};

export const LAND_WIDTH_METERS = 32;
export const LAND_DEPTH_METERS = 12;
export const PLAYER_START = new THREE.Vector3(2.6, 0, 4.4);

/** The three strips and four rows follow 菜地草图.png. */
export const FIELD_COLUMNS = [-10, -2.8, 8.5] as const;
export const FIELD_ROWS = [-2.25, -0.8, 0.65, 2.1] as const;

export function fieldBedWidth(x: number) {
  return x > 2 ? 10 : 7;
}

export function plotSlot(
  index: number,
  id: string,
  total: number,
  position?: { x: number; z: number },
  size?: { width: number; depth: number },
): PlotSlot {
  const column = index % FIELD_COLUMNS.length;
  const row = Math.floor(index / FIELD_COLUMNS.length);
  const fallbackX = FIELD_COLUMNS[column];
  const fallbackZ = FIELD_ROWS[row % FIELD_ROWS.length];
  const x =
    position?.x !== undefined && Number.isFinite(position.x)
      ? position.x
      : fallbackX;
  const z =
    position?.z !== undefined && Number.isFinite(position.z)
      ? position.z
      : fallbackZ;
  return {
    id,
    x,
    z,
    width: size?.width && size.depth <= 2 ? size.width : fieldBedWidth(x),
    depth: size?.depth && size.depth <= 2 ? size.depth : 1.2,
  };
}
