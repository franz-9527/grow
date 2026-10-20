import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type InteractionOptions = {
  element: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  bedMeshes: THREE.Mesh[];
  plotGroups: Map<string, THREE.Group>;
  plotCenters: Map<string, THREE.Vector3>;
  isManageMode: () => boolean;
  isEditMode: () => boolean;
  onSelect: (plotId: string) => void;
  onPositionChange: (plotId: string, x: number, z: number) => void;
};

export class GardenInteraction {
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly groundPoint = new THREE.Vector3();
  private pointerDown: { x: number; y: number } | null = null;
  private drag: {
    pointerId: number;
    plotId: string;
    group: THREE.Group;
    offset: THREE.Vector3;
    start: THREE.Vector3;
    moved: boolean;
  } | null = null;
  private focusTarget: THREE.Vector3 | null = null;
  private focusPosition: THREE.Vector3 | null = null;

  constructor(private readonly options: InteractionOptions) {
    options.element.addEventListener('pointerdown', this.onPointerDown);
    options.element.addEventListener('pointermove', this.onPointerMove);
    options.element.addEventListener('pointerup', this.onPointerUp);
    options.element.addEventListener('pointercancel', this.onPointerCancel);
  }

  focusPlot(plotId: string, immediate = false) {
    const center = this.options.plotCenters.get(plotId);
    if (!center) return;
    const target = center.clone().setY(0.5);
    const direction = this.options.camera.position
      .clone()
      .sub(this.options.controls.target)
      .normalize();
    const distance = THREE.MathUtils.clamp(
      this.options.camera.position.distanceTo(this.options.controls.target) *
        0.62,
      11,
      22,
    );
    this.focusTarget = target;
    this.focusPosition = target.clone().addScaledVector(direction, distance);
    if (immediate) {
      this.options.controls.target.copy(this.focusTarget);
      this.options.camera.position.copy(this.focusPosition);
      this.options.controls.update();
      this.focusTarget = this.focusPosition = null;
    }
  }

  update(delta: number) {
    if (!this.focusTarget || !this.focusPosition || this.drag) return;
    const alpha = 1 - Math.exp(-delta * 5.5);
    this.options.controls.target.lerp(this.focusTarget, alpha);
    this.options.camera.position.lerp(this.focusPosition, alpha);
    if (
      this.options.controls.target.distanceToSquared(this.focusTarget) <
        0.001 &&
      this.options.camera.position.distanceToSquared(this.focusPosition) < 0.003
    ) {
      this.options.controls.target.copy(this.focusTarget);
      this.options.camera.position.copy(this.focusPosition);
      this.focusTarget = this.focusPosition = null;
    }
  }

  dispose() {
    const { element } = this.options;
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointercancel', this.onPointerCancel);
  }

  private updatePointer(event: PointerEvent) {
    const rect = this.options.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  private intersectPlot(event: PointerEvent) {
    if (!this.updatePointer(event)) return null;
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
    const hit = this.raycaster.intersectObjects(
      this.options.bedMeshes,
      false,
    )[0];
    return hit?.object.userData.plotId as string | undefined;
  }

  private intersectGround(event: PointerEvent) {
    if (!this.updatePointer(event)) return null;
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
    return this.raycaster.ray.intersectPlane(this.ground, this.groundPoint)
      ? this.groundPoint.clone()
      : null;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.options.isManageMode() || event.button !== 0) return;
    if (!this.options.isEditMode()) {
      this.pointerDown = { x: event.clientX, y: event.clientY };
      return;
    }
    const plotId = this.intersectPlot(event);
    const group = plotId ? this.options.plotGroups.get(plotId) : undefined;
    const point = this.intersectGround(event);
    if (!plotId || !group || !point) return;
    this.options.onSelect(plotId);
    this.drag = {
      pointerId: event.pointerId,
      plotId,
      group,
      offset: group.position.clone().sub(point),
      start: group.position.clone(),
      moved: false,
    };
    this.options.element.setPointerCapture(event.pointerId);
    this.options.controls.enabled = false;
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const point = this.intersectGround(event);
    if (!point) return;
    const width = Number(this.drag.group.userData.plotWidth) || 4;
    const depth = Number(this.drag.group.userData.plotDepth) || 3;
    this.drag.group.position.x = THREE.MathUtils.clamp(
      point.x + this.drag.offset.x,
      -14 + width / 2,
      14 - width / 2,
    );
    this.drag.group.position.z = THREE.MathUtils.clamp(
      point.z + this.drag.offset.z,
      -10 + depth / 2,
      10 - depth / 2,
    );
    this.options.plotCenters
      .get(this.drag.plotId)
      ?.copy(this.drag.group.position);
    this.drag.moved ||=
      this.drag.group.position.distanceTo(this.drag.start) > 0.05;
    event.preventDefault();
  };

  private finishDrag(event: PointerEvent, canceled = false) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return false;
    const finished = this.drag;
    this.drag = null;
    this.pointerDown = null;
    if (this.options.element.hasPointerCapture(event.pointerId))
      this.options.element.releasePointerCapture(event.pointerId);
    this.options.controls.enabled =
      this.options.isManageMode() && !this.options.isEditMode();
    if (!canceled && finished.moved)
      this.options.onPositionChange(
        finished.plotId,
        Number(finished.group.position.x.toFixed(2)),
        Number(finished.group.position.z.toFixed(2)),
      );
    event.preventDefault();
    return true;
  }

  private onPointerUp = (event: PointerEvent) => {
    if (this.finishDrag(event)) return;
    if (
      !this.options.isManageMode() ||
      this.options.isEditMode() ||
      !this.pointerDown
    )
      return;
    const distance = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y,
    );
    this.pointerDown = null;
    if (distance >= 8) return;
    const plotId = this.intersectPlot(event);
    if (!plotId) return;
    this.options.onSelect(plotId);
    this.focusPlot(plotId);
  };

  private onPointerCancel = (event: PointerEvent) => {
    this.finishDrag(event, true);
    this.pointerDown = null;
  };
}
