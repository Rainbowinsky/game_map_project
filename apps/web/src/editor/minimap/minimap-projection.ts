import {
  visibleWorldRect,
  type CameraState,
  type MapDocument,
  type ScreenPoint,
  type Viewport,
  type WorldPoint,
  type WorldRect,
} from '@fantasy-map/map-model';

export interface MinimapViewport {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface MinimapSize {
  readonly width: number;
  readonly height: number;
}

/** Fits the full document into the available minimap rectangle without distortion. */
export function createMinimapViewport(document: MapDocument, size: MinimapSize): MinimapViewport {
  const scale = Math.min(size.width / document.width, size.height / document.height);
  const width = document.width * scale;
  const height = document.height * scale;
  return {
    width,
    height,
    scale,
    offsetX: (size.width - width) / 2,
    offsetY: (size.height - height) / 2,
  };
}

export function worldToMinimap(point: WorldPoint, viewport: MinimapViewport): ScreenPoint {
  return {
    x: viewport.offsetX + point.x * viewport.scale,
    y: viewport.offsetY + point.y * viewport.scale,
  };
}

export function minimapToWorld(
  point: ScreenPoint,
  viewport: MinimapViewport,
  document: MapDocument,
): WorldPoint {
  return {
    x: Math.max(0, Math.min(document.width, (point.x - viewport.offsetX) / viewport.scale)),
    y: Math.max(0, Math.min(document.height, (point.y - viewport.offsetY) / viewport.scale)),
  };
}

export function minimapCameraRect(
  camera: CameraState,
  viewportSize: Viewport,
  document: MapDocument,
): WorldRect {
  const visible = visibleWorldRect(camera, viewportSize);
  const left = Math.max(0, visible.x);
  const top = Math.max(0, visible.y);
  const right = Math.min(document.width, visible.x + visible.width);
  const bottom = Math.min(document.height, visible.y + visible.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Keeps a camera centre inside the map boundaries at its current zoom. */
export function clampCameraCenter(
  point: WorldPoint,
  camera: CameraState,
  viewport: Viewport,
  document: MapDocument,
): WorldPoint {
  const halfWidth = viewport.width / (2 * camera.zoom);
  const halfHeight = viewport.height / (2 * camera.zoom);
  const minimumX = Math.min(halfWidth, document.width / 2);
  const maximumX = Math.max(document.width - halfWidth, document.width / 2);
  const minimumY = Math.min(halfHeight, document.height / 2);
  const maximumY = Math.max(document.height - halfHeight, document.height / 2);
  return {
    x: Math.max(minimumX, Math.min(maximumX, point.x)),
    y: Math.max(minimumY, Math.min(maximumY, point.y)),
  };
}
