import { Application, Container, Graphics } from 'pixi.js';
import {
  visibleWorldRect,
  type CameraState,
  type MapDocument,
  type Viewport,
} from '@fantasy-map/map-model';
import type { MapLayer } from '@fantasy-map/map-model';

import { RendererProjection } from './RendererProjection.js';

const GRID_LINE_LIMIT = 180;

function colorToNumber(color: string): number {
  const parsed = Number.parseInt(color.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0xc8c5b5;
}

function gridStep(base: number, zoom: number): { minor: number; major: number } {
  let minor = base;
  while (minor * zoom < 22) minor *= 2;
  while (minor * zoom > 58 && minor / 2 >= base) minor /= 2;
  return { minor, major: minor * 5 };
}

export class MapRenderer {
  private readonly application = new Application();
  private readonly worldRoot = new Container();
  private readonly mapBackground = new Graphics();
  private readonly mapClipRoot = new Container();
  private readonly layerRoot = new Container();
  private readonly projection = new RendererProjection(this.layerRoot);
  private readonly worldGrid = new Graphics();
  private readonly worldOverlay = new Container();
  private readonly mapBoundary = new Graphics();
  private readonly screenOverlay = new Container();
  private viewport: Viewport = { width: 1, height: 1 };
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private initialized = false;
  private destroyed = false;

  constructor(private readonly document: MapDocument) {}

  async mount(host: HTMLElement): Promise<HTMLCanvasElement | null> {
    await this.application.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      powerPreference: 'high-performance',
    });
    if (this.destroyed) {
      this.application.destroy(true, { children: true });
      return null;
    }

    const canvas = this.application.canvas;
    canvas.className = 'pixi-canvas';
    canvas.setAttribute('aria-label', '可平移缩放的地图画布');
    canvas.tabIndex = 0;
    host.append(canvas);

    this.application.stage.addChild(this.worldRoot, this.screenOverlay);
    this.worldRoot.addChild(this.mapBackground, this.mapClipRoot, this.mapBoundary);
    this.mapClipRoot.addChild(this.layerRoot, this.worldGrid, this.worldOverlay);
    this.projection.sync(this.document.layers);
    this.drawStaticScene();
    this.initialized = true;
    return canvas;
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
    if (!this.initialized || this.destroyed) return;
    this.application.renderer.resize(viewport.width, viewport.height);
    this.applyCamera();
  }

  setCamera(camera: CameraState): void {
    this.camera = camera;
    if (!this.initialized || this.destroyed) return;
    this.applyCamera();
  }

  getFps(): number {
    return this.initialized ? Math.round(this.application.ticker.FPS) : 0;
  }

  syncLayers(layers: readonly MapLayer[]): void {
    if (this.destroyed) return;
    this.projection.sync(layers);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.initialized) this.application.destroy(true, { children: true });
  }

  private drawStaticScene(): void {
    const { width, height } = this.document;
    const background =
      this.document.background.kind === 'solid'
        ? colorToNumber(this.document.background.color)
        : 0xc9c6b6;
    this.mapBackground
      .rect(0, 0, width, height)
      .fill({ color: background })
      .rect(0, 0, width, height)
      .fill({ color: 0xe7e1cf, alpha: 0.72 });

    const contour = new Graphics();
    contour
      .ellipse(width * 0.18, height * 0.22, width * 0.13, height * 0.09)
      .stroke({ color: 0x59634f, alpha: 0.12, width: 2 })
      .ellipse(width * 0.83, height * 0.75, width * 0.18, height * 0.14)
      .stroke({ color: 0x59634f, alpha: 0.1, width: 2 });
    this.mapBackground.addChild(contour);

    this.mapBoundary
      .rect(0, 0, width, height)
      .stroke({ color: 0xe6e4d7, alpha: 0.55, width: 2 })
      .rect(10, 10, Math.max(0, width - 20), Math.max(0, height - 20))
      .stroke({ color: 0x384133, alpha: 0.3, width: 1 });
  }

  private applyCamera(): void {
    const { width, height } = this.viewport;
    const { x, y, zoom } = this.camera;
    this.worldRoot.scale.set(zoom);
    this.worldRoot.position.set(width / 2 - x * zoom, height / 2 - y * zoom);
    this.drawGrid();
  }

  private drawGrid(): void {
    const grid = this.document.settings.grid;
    this.worldGrid.clear();
    if (!grid.enabled) return;

    const visible = visibleWorldRect(this.camera, this.viewport);
    const left = Math.max(0, visible.x);
    const top = Math.max(0, visible.y);
    const right = Math.min(this.document.width, visible.x + visible.width);
    const bottom = Math.min(this.document.height, visible.y + visible.height);
    if (right <= left || bottom <= top) return;

    const { minor, major } = gridStep(grid.size, this.camera.zoom);
    let lines = 0;
    for (
      let x = Math.ceil(left / minor) * minor;
      x <= right && lines < GRID_LINE_LIMIT;
      x += minor, lines += 1
    ) {
      const isMajor = Math.abs(x / major - Math.round(x / major)) < 0.0001;
      this.worldGrid
        .moveTo(x, top)
        .lineTo(x, bottom)
        .stroke({
          color: 0x3e4839,
          alpha: isMajor ? 0.2 : 0.08,
          width: (isMajor ? 1.2 : 0.7) / this.camera.zoom,
        });
    }
    for (
      let y = Math.ceil(top / minor) * minor;
      y <= bottom && lines < GRID_LINE_LIMIT;
      y += minor, lines += 1
    ) {
      const isMajor = Math.abs(y / major - Math.round(y / major)) < 0.0001;
      this.worldGrid
        .moveTo(left, y)
        .lineTo(right, y)
        .stroke({
          color: 0x3e4839,
          alpha: isMajor ? 0.2 : 0.08,
          width: (isMajor ? 1.2 : 0.7) / this.camera.zoom,
        });
    }
  }
}
