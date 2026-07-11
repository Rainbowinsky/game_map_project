import { Application, Container, Graphics } from 'pixi.js';
import {
  visibleWorldRect,
  type CameraState,
  type MapDocument,
  type MapObject,
  type ObjectTransform,
  type Viewport,
  type WorldPoint,
  type WorldRect,
} from '@fantasy-map/map-model';
import type { MapLayer } from '@fantasy-map/map-model';

import {
  objectsIntersectingRect,
  pickObject,
  rectsIntersect,
  selectionBounds,
  type TransformMode,
} from '../editor/selection/geometry.js';
import { AssetRegistry } from './AssetRegistry.js';
import { ObjectProjection } from './ObjectProjection.js';
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
  private readonly assets = new AssetRegistry();
  private readonly objects = new ObjectProjection(this.projection, this.assets);
  private readonly worldGrid = new Graphics();
  private readonly worldOverlay = new Container();
  private readonly selectionOverlay = new Graphics();
  private readonly marqueeOverlay = new Graphics();
  private readonly mapBoundary = new Graphics();
  private readonly screenOverlay = new Container();
  private viewport: Viewport = { width: 1, height: 1 };
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private initialized = false;
  private destroyed = false;
  private mapObjects: readonly MapObject[] = [];
  private mapLayers: readonly MapLayer[];
  private selectedIds: readonly string[] = [];
  private previewObjects: readonly MapObject[] | null = null;

  constructor(private readonly document: MapDocument) {
    this.mapLayers = document.layers;
  }

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
    this.worldOverlay.addChild(this.selectionOverlay, this.marqueeOverlay);
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
    this.mapLayers = layers;
    this.projection.sync(layers);
    this.objects.sync(this.mapObjects);
  }

  syncObjects(objects: readonly MapObject[]): void {
    if (this.destroyed) return;
    this.mapObjects = objects;
    this.objects.sync(objects);
    this.drawSelection();
    this.updateCulling();
  }

  setSelection(objectIds: readonly string[]): void {
    this.selectedIds = objectIds;
    this.drawSelection();
  }

  previewTransforms(changesById: Readonly<Record<string, ObjectTransform>>): void {
    this.previewObjects = this.objects.preview(changesById);
    this.drawSelection();
  }

  clearPreview(): void {
    this.previewObjects = null;
    this.objects.clearPreview();
    this.drawSelection();
  }

  showMarquee(rect: WorldRect | null): void {
    this.marqueeOverlay.clear();
    if (!rect) return;
    this.marqueeOverlay
      .rect(rect.x, rect.y, rect.width, rect.height)
      .fill({ color: 0xa9b99a, alpha: 0.08 })
      .stroke({ color: 0xc6d2b8, alpha: 0.9, width: 1 / this.camera.zoom });
  }

  pick(point: WorldPoint): MapObject | undefined {
    return pickObject(point, this.mapObjects, this.mapLayers);
  }

  objectsInRect(rect: WorldRect): string[] {
    return objectsIntersectingRect(rect, this.mapObjects, this.mapLayers);
  }

  hitSelectionHandle(point: WorldPoint): TransformMode | null {
    const bounds = this.currentSelectionBounds();
    if (!bounds) return null;
    const tolerance = 12 / this.camera.zoom;
    const rotate = { x: bounds.x + bounds.width / 2, y: bounds.y - 28 / this.camera.zoom };
    if (Math.hypot(point.x - rotate.x, point.y - rotate.y) <= tolerance) return 'rotate';
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ];
    return corners.some((corner) => Math.hypot(point.x - corner.x, point.y - corner.y) <= tolerance)
      ? 'scale'
      : null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.objects.destroy();
    this.assets.destroy();
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
    this.updateCulling();
    this.drawSelection();
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

  private currentSelectionBounds(): WorldRect | null {
    const source = this.previewObjects ?? this.mapObjects;
    return selectionBounds(source.filter((object) => this.selectedIds.includes(object.id)));
  }

  private drawSelection(): void {
    this.selectionOverlay.clear();
    const bounds = this.currentSelectionBounds();
    if (!bounds || this.camera.zoom <= 0) return;
    const line = 1.5 / this.camera.zoom;
    const handle = 9 / this.camera.zoom;
    const rotateY = bounds.y - 28 / this.camera.zoom;
    this.selectionOverlay
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .stroke({ color: 0xdce8cf, alpha: 0.95, width: line })
      .moveTo(bounds.x + bounds.width / 2, bounds.y)
      .lineTo(bounds.x + bounds.width / 2, rotateY)
      .stroke({ color: 0xdce8cf, alpha: 0.8, width: line });
    for (const [x, y] of [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x, bounds.y + bounds.height],
      [bounds.x + bounds.width, bounds.y + bounds.height],
    ] as const) {
      this.selectionOverlay
        .rect(x - handle / 2, y - handle / 2, handle, handle)
        .fill({ color: 0x263024 })
        .stroke({ color: 0xe6efda, width: line });
    }
    this.selectionOverlay
      .circle(bounds.x + bounds.width / 2, rotateY, handle / 2)
      .fill({ color: 0x9ead91 })
      .stroke({ color: 0xf0f5e9, width: line });
  }

  private updateCulling(): void {
    if (!this.initialized) return;
    const visible = visibleWorldRect(this.camera, this.viewport);
    this.objects.setVisibleRect(visible);
    // Hide overlays when the selected group is entirely outside the viewport.
    const selected = this.currentSelectionBounds();
    this.selectionOverlay.visible = selected === null || rectsIntersect(visible, selected);
  }
}
