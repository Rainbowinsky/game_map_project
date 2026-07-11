import {
  fitToMap,
  screenToWorld,
  worldToScreen,
  zoomFromWheel,
  type CameraState,
  type ScreenPoint,
  type Viewport,
  type WorldPoint,
  type WorldRect,
} from '@fantasy-map/map-model';

export interface CameraSnapshot {
  readonly camera: CameraState;
  readonly viewport: Viewport;
}

export interface CameraControllerOptions {
  readonly initialCamera?: CameraState;
  readonly initialViewport?: Viewport;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly onChange?: (snapshot: CameraSnapshot) => void;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
}

type PendingChange = (camera: CameraState) => CameraState;

const defaultViewport: Viewport = { width: 1, height: 1 };
const defaultCamera: CameraState = { x: 0, y: 0, zoom: 1 };

export class CameraController {
  private camera: CameraState;
  private viewport: Viewport;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly onChange: ((snapshot: CameraSnapshot) => void) | undefined;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private pending: PendingChange[] = [];
  private frameHandle: number | null = null;
  private animationHandle: number | null = null;
  private destroyed = false;

  constructor(options: CameraControllerOptions) {
    this.camera = options.initialCamera ?? defaultCamera;
    this.viewport = options.initialViewport ?? defaultViewport;
    this.minZoom = options.minZoom;
    this.maxZoom = options.maxZoom;
    this.onChange = options.onChange;
    this.requestFrame =
      options.requestFrame ?? ((callback) => globalThis.requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((handle) => globalThis.cancelAnimationFrame(handle));
  }

  getSnapshot(): CameraSnapshot {
    return { camera: { ...this.camera }, viewport: { ...this.viewport } };
  }

  setViewport(viewport: Viewport): void {
    if (
      this.destroyed ||
      (viewport.width === this.viewport.width && viewport.height === this.viewport.height)
    ) {
      return;
    }
    this.viewport = viewport;
    this.emit();
  }

  screenToWorld(point: ScreenPoint): WorldPoint {
    return screenToWorld(point, this.camera, this.viewport);
  }

  worldToScreen(point: WorldPoint): ScreenPoint {
    return worldToScreen(point, this.camera, this.viewport);
  }

  panByScreen(deltaX: number, deltaY: number): void {
    this.enqueue((camera) => ({
      ...camera,
      x: camera.x - deltaX / camera.zoom,
      y: camera.y - deltaY / camera.zoom,
    }));
  }

  zoomAt(pointer: ScreenPoint, deltaY: number): void {
    this.enqueue((camera) =>
      zoomFromWheel(camera, pointer, this.viewport, deltaY, 0.0015, this.minZoom, this.maxZoom),
    );
  }

  zoomBy(factor: number, pointer?: ScreenPoint): void {
    const anchor = pointer ?? { x: this.viewport.width / 2, y: this.viewport.height / 2 };
    this.zoomAt(anchor, -Math.log(factor) / 0.0015);
  }

  fit(map: WorldRect, padding = 72, animate = true): void {
    const target = fitToMap({
      map,
      viewport: this.viewport,
      padding,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
    });
    this.moveTo(target, animate);
  }

  focus(rect: WorldRect, padding = 120, animate = true): void {
    this.fit(rect, padding, animate);
  }

  moveTo(target: CameraState, animate: boolean): void {
    this.cancelAnimation();
    this.flush();
    if (!animate) {
      this.camera = target;
      this.emit();
      return;
    }

    const origin = this.camera;
    const startedAt = performance.now();
    const duration = 420;
    const tick = (time: number) => {
      if (this.destroyed) return;
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      this.camera = {
        x: origin.x + (target.x - origin.x) * eased,
        y: origin.y + (target.y - origin.y) * eased,
        zoom: origin.zoom * Math.pow(target.zoom / origin.zoom, eased),
      };
      this.emit();
      this.animationHandle = progress < 1 ? this.requestFrame(tick) : null;
    };
    this.animationHandle = this.requestFrame(tick);
  }

  flush(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    if (this.pending.length === 0 || this.destroyed) return;
    const changes = this.pending;
    this.pending = [];
    this.camera = changes.reduce((camera, change) => change(camera), this.camera);
    this.emit();
  }

  destroy(): void {
    this.destroyed = true;
    this.pending = [];
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    this.cancelAnimation();
  }

  private enqueue(change: PendingChange): void {
    if (this.destroyed) return;
    this.cancelAnimation();
    this.pending.push(change);
    if (this.frameHandle !== null) return;
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null;
      this.flush();
    });
  }

  private emit(): void {
    this.onChange?.(this.getSnapshot());
  }

  private cancelAnimation(): void {
    if (this.animationHandle !== null) this.cancelFrame(this.animationHandle);
    this.animationHandle = null;
  }
}
