import { Application, Container, Graphics } from 'pixi.js';
import {
  visibleWorldRect,
  type CameraState,
  type MapDocument,
  type MapObject,
  type ObjectTransform,
  type ThemeTokens,
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
import {
  exportMapToPng,
  rendererMaxTextureSize,
  type PngExportResult,
} from '../exports/png-exporter.js';
import { colorToNumber, drawMapArtwork } from './map-artwork.js';
import { ObjectProjection } from './ObjectProjection.js';
import { drawPath, drawRegion } from './geometry-render.js';
import { RendererProjection } from './RendererProjection.js';
import { themeRegistry } from '../themes/ThemeRegistry.js';

const GRID_LINE_LIMIT = 180;

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
  private readonly geometryPreview = new Graphics();
  private readonly selectionOverlay = new Graphics();
  private readonly marqueeOverlay = new Graphics();
  private readonly mapBoundary = new Graphics();
  private readonly screenOverlay = new Container();
  private viewport: Viewport = { width: 1, height: 1 };
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private initialized = false;
  private destroyed = false;
  private readonly mapObjects = new Map<string, MapObject>();
  private mapLayers: readonly MapLayer[];
  private selectedIds: readonly string[] = [];
  private previewObjects: readonly MapObject[] | null = null;

  private document: MapDocument;
  private themeTokens: ThemeTokens;

  constructor(document: MapDocument) {
    this.document = document;
    this.themeTokens = themeRegistry.resolve(document.themeId).tokens;
    this.mapLayers = document.layers;
    this.objects.setTheme(this.themeTokens);
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
    this.worldOverlay.addChild(this.geometryPreview, this.selectionOverlay, this.marqueeOverlay);
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

  getVisibleObjectCount(): number {
    return this.objects.getVisibleObjectCount();
  }

  getExportMaxTextureSize(): number | null {
    return this.initialized ? rendererMaxTextureSize(this.application.renderer) : null;
  }

  async exportPng(requestedLongEdge: number): Promise<PngExportResult> {
    if (!this.initialized || this.destroyed) {
      throw new Error('地图画布尚未就绪，暂时无法导出。');
    }
    return exportMapToPng({
      renderer: this.application.renderer,
      document: this.document,
      themeTokens: this.themeTokens,
      layers: this.mapLayers,
      objects: [...this.mapObjects.values()],
      requestedLongEdge,
      constraints: { deviceMaxTextureSize: this.getExportMaxTextureSize() },
    });
  }

  syncLayers(layers: readonly MapLayer[]): void {
    if (this.destroyed) return;
    this.mapLayers = layers;
    this.projection.sync(layers);
  }

  syncDocument(document: MapDocument): void {
    if (this.destroyed) return;
    if (document.id !== this.document.id) throw new Error('Cannot sync another map document.');
    this.document = document;
    this.themeTokens = themeRegistry.resolve(document.themeId).tokens;
    this.objects.setTheme(this.themeTokens);
    if (!this.initialized) return;
    this.drawStaticScene();
    this.drawGrid();
    this.drawSelection();
  }

  syncObjects(objects: readonly MapObject[]): void {
    if (this.destroyed) return;
    this.mapObjects.clear();
    for (const object of objects) this.mapObjects.set(object.id, object);
    this.objects.sync(objects);
    this.drawSelection();
    this.updateCulling();
  }

  /** Projects a committed object patch without resyncing unaffected stamps. */
  upsertObject(object: MapObject): void {
    if (this.destroyed) return;
    this.mapObjects.set(object.id, object);
    this.objects.upsert(object);
    this.drawSelection();
  }

  removeObject(objectId: string): void {
    if (this.destroyed) return;
    this.mapObjects.delete(objectId);
    this.objects.removeObject(objectId);
    this.drawSelection();
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

  previewGeometry(object: MapObject | null): void {
    this.geometryPreview.clear();
    if (!object) return;
    if (object.type === 'path')
      drawPath(this.geometryPreview, { ...object, opacity: 0.72 }, this.themeTokens);
    else if (object.type === 'region')
      drawRegion(this.geometryPreview, { ...object, opacity: 0.72 }, this.themeTokens);
  }

  hitSelectedGeometryNode(point: WorldPoint): { objectId: string; index: number } | null {
    const tolerance = 11 / this.camera.zoom;
    for (const objectId of this.selectedIds) {
      const object = this.mapObjects.get(objectId);
      const points =
        object?.type === 'path'
          ? object.nodes.map((node) => node.anchor)
          : object?.type === 'region'
            ? object.vertices
            : [];
      const index = points.findIndex(
        (candidate) => Math.hypot(point.x - candidate.x, point.y - candidate.y) <= tolerance,
      );
      if (index >= 0) return { objectId, index };
    }
    return null;
  }

  showMarquee(rect: WorldRect | null): void {
    this.marqueeOverlay.clear();
    if (!rect) return;
    this.marqueeOverlay
      .rect(rect.x, rect.y, rect.width, rect.height)
      .fill({ color: colorToNumber(this.themeTokens.selection), alpha: 0.08 })
      .stroke({
        color: colorToNumber(this.themeTokens.selection),
        alpha: 0.9,
        width: 1 / this.camera.zoom,
      });
  }

  pick(point: WorldPoint): MapObject | undefined {
    return pickObject(point, [...this.mapObjects.values()], this.mapLayers);
  }

  objectsInRect(rect: WorldRect): string[] {
    return objectsIntersectingRect(rect, [...this.mapObjects.values()], this.mapLayers);
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
    this.mapObjects.clear();
    this.assets.destroy();
    if (this.initialized) this.application.destroy(true, { children: true });
  }

  private drawStaticScene(): void {
    drawMapArtwork(this.document, this.themeTokens, this.mapBackground, this.mapBoundary);
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
          color: colorToNumber(this.themeTokens.grid),
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
          color: colorToNumber(this.themeTokens.grid),
          alpha: isMajor ? 0.2 : 0.08,
          width: (isMajor ? 1.2 : 0.7) / this.camera.zoom,
        });
    }
  }

  private currentSelectionBounds(): WorldRect | null {
    const source = this.previewObjects ?? [...this.mapObjects.values()];
    return selectionBounds(source.filter((object) => this.selectedIds.includes(object.id)));
  }

  private drawSelection(): void {
    this.selectionOverlay.clear();
    const selectedGeometry = this.selectedIds
      .map((id) => this.mapObjects.get(id))
      .find((object) => object?.type === 'path' || object?.type === 'region');
    if (selectedGeometry?.type === 'path' || selectedGeometry?.type === 'region') {
      const points =
        selectedGeometry.type === 'path'
          ? selectedGeometry.nodes.map((node) => node.anchor)
          : selectedGeometry.vertices;
      const radius = 5.5 / this.camera.zoom;
      const line = 1.5 / this.camera.zoom;
      for (const point of points) {
        this.selectionOverlay
          .circle(point.x, point.y, radius)
          .fill({ color: colorToNumber(this.themeTokens.text), alpha: 1 })
          .stroke({ color: colorToNumber(this.themeTokens.selection), width: line });
      }
      return;
    }
    const bounds = this.currentSelectionBounds();
    if (!bounds || this.camera.zoom <= 0) return;
    const line = 1.5 / this.camera.zoom;
    const handle = 9 / this.camera.zoom;
    const rotateY = bounds.y - 28 / this.camera.zoom;
    this.selectionOverlay
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .stroke({ color: colorToNumber(this.themeTokens.selection), alpha: 0.95, width: line })
      .moveTo(bounds.x + bounds.width / 2, bounds.y)
      .lineTo(bounds.x + bounds.width / 2, rotateY)
      .stroke({ color: colorToNumber(this.themeTokens.selection), alpha: 0.8, width: line });
    for (const [x, y] of [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x, bounds.y + bounds.height],
      [bounds.x + bounds.width, bounds.y + bounds.height],
    ] as const) {
      this.selectionOverlay
        .rect(x - handle / 2, y - handle / 2, handle, handle)
        .fill({ color: colorToNumber(this.themeTokens.text) })
        .stroke({ color: colorToNumber(this.themeTokens.selection), width: line });
    }
    this.selectionOverlay
      .circle(bounds.x + bounds.width / 2, rotateY, handle / 2)
      .fill({ color: colorToNumber(this.themeTokens.grid) })
      .stroke({ color: colorToNumber(this.themeTokens.selection), width: line });
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
