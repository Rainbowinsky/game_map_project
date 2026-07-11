import {
  cameraStateSchema,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  screenPointSchema,
  viewportSchema,
  worldPointSchema,
  worldRectSchema,
  type CameraState,
  type ScreenPoint,
  type Viewport,
  type WorldPoint,
  type WorldRect,
} from './primitives.js';

export interface ZoomAtPointOptions {
  readonly camera: CameraState;
  readonly pointer: ScreenPoint;
  readonly viewport: Viewport;
  readonly nextZoom: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
}

export interface FitToMapOptions {
  readonly map: WorldRect;
  readonly viewport: Viewport;
  readonly padding?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  if (![value, minimum, maximum].every(Number.isFinite)) {
    throw new TypeError('Clamp values must be finite numbers.');
  }

  if (minimum > maximum) {
    throw new RangeError('Clamp minimum cannot exceed maximum.');
  }

  return Math.min(Math.max(value, minimum), maximum);
}

export function worldToScreen(
  worldInput: WorldPoint,
  cameraInput: CameraState,
  viewportInput: Viewport,
): ScreenPoint {
  const world = worldPointSchema.parse(worldInput);
  const camera = cameraStateSchema.parse(cameraInput);
  const viewport = viewportSchema.parse(viewportInput);

  return {
    x: (world.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (world.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(
  screenInput: ScreenPoint,
  cameraInput: CameraState,
  viewportInput: Viewport,
): WorldPoint {
  const screen = screenPointSchema.parse(screenInput);
  const camera = cameraStateSchema.parse(cameraInput);
  const viewport = viewportSchema.parse(viewportInput);

  return worldPointSchema.parse({
    x: (screen.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (screen.y - viewport.height / 2) / camera.zoom + camera.y,
  });
}

export function zoomAtPoint(options: ZoomAtPointOptions): CameraState {
  const camera = cameraStateSchema.parse(options.camera);
  const pointer = screenPointSchema.parse(options.pointer);
  const viewport = viewportSchema.parse(options.viewport);
  const minZoom = options.minZoom ?? MIN_CAMERA_ZOOM;
  const maxZoom = options.maxZoom ?? MAX_CAMERA_ZOOM;
  const nextZoom = clamp(options.nextZoom, minZoom, maxZoom);
  const anchorWorld = screenToWorld(pointer, camera, viewport);

  return cameraStateSchema.parse({
    x: anchorWorld.x - (pointer.x - viewport.width / 2) / nextZoom,
    y: anchorWorld.y - (pointer.y - viewport.height / 2) / nextZoom,
    zoom: nextZoom,
  });
}

export function zoomFromWheel(
  camera: CameraState,
  pointer: ScreenPoint,
  viewport: Viewport,
  deltaY: number,
  sensitivity = 0.0015,
  minZoom = MIN_CAMERA_ZOOM,
  maxZoom = MAX_CAMERA_ZOOM,
): CameraState {
  if (!Number.isFinite(deltaY) || !Number.isFinite(sensitivity) || sensitivity <= 0) {
    throw new RangeError('Wheel delta must be finite and sensitivity must be positive.');
  }

  return zoomAtPoint({
    camera,
    pointer,
    viewport,
    nextZoom: camera.zoom * Math.exp(-deltaY * sensitivity),
    minZoom,
    maxZoom,
  });
}

export function fitToMap(options: FitToMapOptions): CameraState {
  const map = worldRectSchema.parse(options.map);
  const viewport = viewportSchema.parse(options.viewport);
  const padding = options.padding ?? 48;
  const minZoom = options.minZoom ?? MIN_CAMERA_ZOOM;
  const maxZoom = options.maxZoom ?? MAX_CAMERA_ZOOM;

  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError('Map padding must be a non-negative finite number.');
  }

  const availableWidth = viewport.width - padding * 2;
  const availableHeight = viewport.height - padding * 2;

  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new RangeError('Map padding leaves no visible viewport area.');
  }

  return cameraStateSchema.parse({
    x: map.x + map.width / 2,
    y: map.y + map.height / 2,
    zoom: clamp(
      Math.min(availableWidth / map.width, availableHeight / map.height),
      minZoom,
      maxZoom,
    ),
  });
}

export function visibleWorldRect(camera: CameraState, viewport: Viewport): WorldRect {
  const topLeft = screenToWorld({ x: 0, y: 0 }, camera, viewport);
  const bottomRight = screenToWorld({ x: viewport.width, y: viewport.height }, camera, viewport);

  return worldRectSchema.parse({
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  });
}
