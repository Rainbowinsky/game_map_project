import { useEffect, useRef } from 'react';
import {
  mapObjectSchema,
  locationSchema,
  toChunkCoordinate,
  type CameraState,
  type MapDocument,
  type MapObject,
  type PathKind,
  type TerrainBrush,
  type TerrainKind,
  type TerrainStrokePoint,
  type ObjectTransform,
  type ScreenPoint,
  type WorldPoint,
  type WorldRect,
} from '@fantasy-map/map-model';

import { getStampAsset, stampPlacementScale } from '../assets/stamp-assets.js';
import { CameraController, type CameraSnapshot } from '../camera/CameraController.js';
import {
  CreateObjectCommand,
  CreatePathCommand,
  CreateRegionCommand,
  CreateLocationCommand,
  DeleteObjectCommand,
  DrawTerrainStrokeCommand,
  TransformObjectsCommand,
  UpdateObjectCommand,
  UpdatePathGeometryCommand,
  UpdateRegionGeometryCommand,
} from '../editor/commands/commands.js';
import type { CommandManager } from '../editor/commands/CommandManager.js';
import type { PatchEvent } from '../editor/commands/patch-bus.js';
import { isLayerEffectivelyEditable } from '../editor/layers/layer-tree.js';
import {
  appendFreehandPoint,
  finishFreehandPoints,
  freehandPathNodes,
  freehandRegionVertices,
} from '../editor/geometry/freehand-geometry.js';
import {
  appendResampledSegment,
  fitTerrainStrokePayload,
  finishResampledStroke,
  strokeIntersectsEraser,
  terrainStrokePayloadFits,
} from '../editor/terrain/terrain-stroke.js';
import {
  rectFromPoints,
  selectionBounds,
  transformedObjects,
  type TransformMode,
} from '../editor/selection/geometry.js';
import { MapRenderer } from '../renderer/MapRenderer.js';
import type { PngExportResult } from '../exports/png-exporter.js';
import { useEditorStore, type EditorTool } from '../stores/editor-store.js';
import { useMapStore } from '../stores/map-store.js';
import { themeRegistry } from '../themes/ThemeRegistry.js';

export interface CanvasTelemetry {
  readonly camera: CameraState;
  readonly pointerWorld: WorldPoint | null;
  readonly fps: number;
  readonly visibleObjectCount: number;
}

export interface PixiCanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitMap(animate?: boolean): void;
  focusAt(point: WorldPoint, animate?: boolean): void;
  centerAt(point: WorldPoint, animate?: boolean): void;
  getExportMaxTextureSize(): number | null;
  exportPng(longEdge: number): Promise<PngExportResult>;
}

interface PixiCanvasProps {
  readonly document: MapDocument;
  readonly tool: EditorTool;
  readonly activeStampAssetId: string;
  readonly commandManager: CommandManager;
  readonly onReady?: (handle: PixiCanvasHandle) => void;
  readonly onTelemetry: (telemetry: CanvasTelemetry) => void;
  readonly onInteractionError?: (message: string | null) => void;
}

interface TransformGesture {
  readonly kind: 'transform';
  readonly mode: TransformMode;
  readonly start: WorldPoint;
  readonly originals: readonly MapObject[];
  readonly bounds: WorldRect;
  changes: Readonly<Record<string, ObjectTransform>> | null;
}

interface MarqueeGesture {
  readonly kind: 'marquee';
  readonly start: WorldPoint;
  readonly preserveSelection: boolean;
}

interface GeometryNodeGesture {
  readonly kind: 'geometry-node';
  readonly object: Extract<MapObject, { type: 'path' | 'region' }>;
  readonly nodeIndex: number;
  candidate: Extract<MapObject, { type: 'path' | 'region' }> | null;
}

type EditGesture = TransformGesture | MarqueeGesture | GeometryNodeGesture;

interface DrawingGesture {
  readonly tool: 'road' | 'river' | 'region';
  readonly minimumDistance: number;
  readonly simplifyTolerance: number;
  points: readonly WorldPoint[];
}

interface TerrainGesture {
  readonly mode: 'draw' | 'erase';
  readonly terrainKind: TerrainKind;
  readonly brush: TerrainBrush;
  layerId: string;
  points: TerrainStrokePoint[];
  nextBudgetCheck: number;
  createdObjectIds: string[];
}

function localPoint(
  event: MouseEvent | PointerEvent | WheelEvent | DragEvent,
  element: HTMLElement,
): ScreenPoint {
  const bounds = element.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function editableStampLayerId(): string | null {
  const { activeLayerId } = useEditorStore.getState();
  const { layersById } = useMapStore.getState();
  const active = activeLayerId ? layersById[activeLayerId] : undefined;
  if (active?.type === 'stamp' && isLayerEffectivelyEditable(active.id, layersById))
    return active.id;
  return (
    Object.values(layersById)
      .filter((layer) => layer.type === 'stamp' && isLayerEffectivelyEditable(layer.id, layersById))
      .sort((left, right) => right.order - left.order)[0]?.id ?? null
  );
}

function editableGeometryLayerId(type: 'vector-path' | 'region'): string | null {
  const { activeLayerId } = useEditorStore.getState();
  const { layersById } = useMapStore.getState();
  const active = activeLayerId ? layersById[activeLayerId] : undefined;
  if (active?.type === type && isLayerEffectivelyEditable(active.id, layersById)) return active.id;
  return (
    Object.values(layersById)
      .filter((layer) => layer.type === type && isLayerEffectivelyEditable(layer.id, layersById))
      .sort((left, right) => right.order - left.order)[0]?.id ?? null
  );
}

function editableTerrainLayerId(): string | null {
  const { activeLayerId } = useEditorStore.getState();
  const { layersById } = useMapStore.getState();
  const active = activeLayerId ? layersById[activeLayerId] : undefined;
  if (active?.type === 'raster' && isLayerEffectivelyEditable(active.id, layersById))
    return active.id;
  return (
    Object.values(layersById)
      .filter(
        (layer) => layer.type === 'raster' && isLayerEffectivelyEditable(layer.id, layersById),
      )
      .sort((left, right) => right.order - left.order)[0]?.id ?? null
  );
}

function editableLayerId(type: 'text' | 'marker'): string | null {
  const { activeLayerId } = useEditorStore.getState();
  const { layersById } = useMapStore.getState();
  const active = activeLayerId ? layersById[activeLayerId] : undefined;
  if (active?.type === type && isLayerEffectivelyEditable(active.id, layersById)) return active.id;
  return (
    Object.values(layersById)
      .filter((layer) => layer.type === type && isLayerEffectivelyEditable(layer.id, layersById))
      .sort((left, right) => right.order - left.order)[0]?.id ?? null
  );
}

function clampToMap(document: MapDocument, point: WorldPoint): WorldPoint {
  return {
    x: Math.max(0, Math.min(document.width, point.x)),
    y: Math.max(0, Math.min(document.height, point.y)),
  };
}

function createGeometryObject(
  document: MapDocument,
  tool: DrawingGesture['tool'],
  inputPoints: readonly WorldPoint[],
): Extract<MapObject, { type: 'path' | 'region' }> {
  const points = inputPoints.map((point) => clampToMap(document, point));
  const layerType = tool === 'region' ? 'region' : 'vector-path';
  const layerId = editableGeometryLayerId(layerType);
  if (!layerId)
    throw new Error(`请先创建或解锁一个可编辑的${tool === 'region' ? '区域' : '路径'}图层。`);
  const now = new Date().toISOString();
  const style = useEditorStore.getState().geometryStyle;
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const zIndex =
    Math.max(
      -1,
      ...Object.values(useMapStore.getState().objectsById)
        .filter((object) => object.layerId === layerId)
        .map((object) => object.zIndex),
    ) + 1;
  const base = {
    id: crypto.randomUUID(),
    mapId: document.id,
    layerId,
    chunk: toChunkCoordinate(center, document.settings.chunkSize),
    name: tool === 'region' ? '新区域' : tool === 'river' ? '新河流' : '新道路',
    ...center,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex,
    visible: true,
    locked: false,
    opacity: style.opacity,
    metadata: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
  return mapObjectSchema.parse(
    tool === 'region'
      ? {
          ...base,
          type: 'region',
          vertices: points,
          fillToken: 'region.default.fill',
          strokeToken: 'region.default.stroke',
          strokeWidth: style.regionStrokeWidth,
        }
      : {
          ...base,
          type: 'path',
          pathKind: tool as PathKind,
          nodes: freehandPathNodes(points),
          styleToken: `path.${tool}`,
          widthStart: tool === 'river' ? style.riverWidth : style.roadWidth,
          widthEnd: tool === 'river' ? style.riverWidth : style.roadWidth,
        },
  ) as Extract<MapObject, { type: 'path' | 'region' }>;
}

function createTerrainObject(
  document: MapDocument,
  terrainKind: TerrainKind,
  brush: TerrainBrush,
  inputPoints: readonly TerrainStrokePoint[],
  requestedLayerId?: string,
): Extract<MapObject, { type: 'terrain-stroke' }> {
  const map = useMapStore.getState();
  const requestedLayer = requestedLayerId ? map.layersById[requestedLayerId] : undefined;
  const layerId =
    requestedLayer?.type === 'raster' &&
    isLayerEffectivelyEditable(requestedLayer.id, map.layersById)
      ? requestedLayer.id
      : editableTerrainLayerId();
  if (!layerId) throw new Error('请先创建或解锁一个可编辑的地形图层。');
  const points = inputPoints.map((point) => ({ ...point, ...clampToMap(document, point) }));
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const now = new Date().toISOString();
  const zIndex =
    Math.max(
      -1,
      ...Object.values(map.objectsById)
        .filter((object) => object.layerId === layerId)
        .map((object) => object.zIndex),
    ) + 1;
  return mapObjectSchema.parse({
    id: crypto.randomUUID(),
    mapId: document.id,
    layerId,
    chunk: toChunkCoordinate(center, document.settings.chunkSize),
    type: 'terrain-stroke',
    terrainKind,
    brush,
    points,
    randomSeed: crypto.getRandomValues(new Uint32Array(1))[0],
    styleToken: `terrain.${terrainKind}`,
    name: `地形-${terrainKind}`,
    ...center,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex,
    visible: true,
    locked: false,
    opacity: 1,
    metadata: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  }) as Extract<MapObject, { type: 'terrain-stroke' }>;
}

function createStampObject(
  document: MapDocument,
  assetId: string,
  point: WorldPoint,
  cameraZoom: number,
): MapObject {
  const asset = getStampAsset(assetId);
  if (!asset) throw new Error('所选图章资源不存在。');
  const layerId = editableStampLayerId();
  if (!layerId) throw new Error('请先创建或解锁一个可编辑的图章图层。');
  const now = new Date().toISOString();
  const objects = Object.values(useMapStore.getState().objectsById);
  const zIndex =
    Math.max(
      -1,
      ...objects.filter((object) => object.layerId === layerId).map((object) => object.zIndex),
    ) + 1;
  const x = Math.max(0, Math.min(document.width, point.x));
  const y = Math.max(0, Math.min(document.height, point.y));
  const scale = stampPlacementScale(cameraZoom);
  return {
    id: crypto.randomUUID(),
    mapId: document.id,
    layerId,
    chunk: toChunkCoordinate({ x, y }, document.settings.chunkSize),
    type: 'stamp',
    name: asset.name,
    x,
    y,
    rotation: 0,
    scaleX: scale,
    scaleY: scale,
    zIndex,
    visible: true,
    locked: false,
    opacity: 1,
    metadata: { source: 'builtin-original' },
    revision: 0,
    assetId: asset.id,
    stampKind: asset.kind,
    tint: null,
    flipX: false,
    flipY: false,
    randomSeed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

function objectBase(document: MapDocument, layerId: string, point: WorldPoint, name: string) {
  const now = new Date().toISOString();
  const position = clampToMap(document, point);
  const zIndex =
    Math.max(
      -1,
      ...Object.values(useMapStore.getState().objectsById)
        .filter((object) => object.layerId === layerId)
        .map((object) => object.zIndex),
    ) + 1;
  return {
    id: crypto.randomUUID(),
    mapId: document.id,
    layerId,
    chunk: toChunkCoordinate(position, document.settings.chunkSize),
    name,
    ...position,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex,
    visible: true,
    locked: false,
    opacity: 1,
    metadata: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function createTextObject(document: MapDocument, point: WorldPoint): MapObject {
  const layerId = editableLayerId('text');
  if (!layerId) throw new Error('请先创建或解锁一个可编辑的文字图层。');
  const draft = useEditorStore.getState().textDraft;
  const text = draft.text.trim() || '新文字';
  return mapObjectSchema.parse({
    ...objectBase(document, layerId, point, text.slice(0, 120)),
    type: 'text',
    text,
    fontSize: draft.fontSize,
    align: draft.align,
    fontToken: 'font.default',
    colorToken: 'text.default',
  });
}

function createLocationPair(document: MapDocument, point: WorldPoint) {
  const layerId = editableLayerId('marker');
  if (!layerId) throw new Error('请先创建或解锁一个可编辑的标记图层。');
  const draft = useEditorStore.getState().locationDraft;
  const id = crypto.randomUUID();
  const markerId = crypto.randomUUID();
  const now = new Date().toISOString();
  const position = clampToMap(document, point);
  const marker = mapObjectSchema.parse({
    ...objectBase(document, layerId, position, `${draft.name} 标记`),
    id: markerId,
    type: 'marker',
    locationId: id,
    iconAssetId: null,
    minZoom: null,
    maxZoom: null,
  });
  const tags = [
    ...new Set(
      draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  const location = locationSchema.parse({
    id,
    mapId: document.id,
    name: draft.name,
    type: draft.type,
    ...position,
    summary: draft.summary.trim() || null,
    description: draft.description.trim() || null,
    regionId: null,
    iconAssetId: null,
    markerObjectId: markerId,
    tags,
    customFields: {},
    minZoom: null,
    maxZoom: null,
    createdAt: now,
    updatedAt: now,
  });
  return { location, marker };
}

export function PixiCanvas({
  document,
  tool,
  activeStampAssetId,
  commandManager,
  onReady,
  onTelemetry,
  onInteractionError,
}: PixiCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialDocumentRef = useRef(document);
  if (initialDocumentRef.current.id !== document.id) initialDocumentRef.current = document;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const assetRef = useRef(activeStampAssetId);
  assetRef.current = activeStampAssetId;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initialDocument = initialDocumentRef.current;
    let disposed = false;
    let spacePressed = false;
    let panning = false;
    let panPointer: ScreenPoint | null = null;
    let lastPointer: ScreenPoint | null = null;
    let pointerWorld: WorldPoint | null = null;
    let gesture: EditGesture | null = null;
    let drawing: DrawingGesture | null = null;
    let terrainGesture: TerrainGesture | null = null;
    let textEditor: { element: HTMLTextAreaElement; objectId: string } | null = null;
    let telemetryCamera: CameraState = { x: 0, y: 0, zoom: 1 };
    let telemetryTimer = 0;
    const renderer = new MapRenderer(initialDocument);

    const syncProjection = () => {
      const map = useMapStore.getState();
      const selected = useEditorStore
        .getState()
        .selection.filter((objectId) => Boolean(map.objectsById[objectId]));
      if (selected.length !== useEditorStore.getState().selection.length) {
        useEditorStore.getState().setSelection(selected);
      }
      renderer.syncLayers(Object.values(map.layersById));
      renderer.syncObjects(Object.values(map.objectsById));
      renderer.setSelection(selected);
      scheduleTelemetry();
    };
    const applyProjectionPatch = ({ patches }: PatchEvent) => {
      const map = useMapStore.getState();
      const selected = useEditorStore
        .getState()
        .selection.filter((objectId) => Boolean(map.objectsById[objectId]));
      if (selected.length !== useEditorStore.getState().selection.length) {
        useEditorStore.getState().setSelection(selected);
      }
      if (
        patches.some(
          (patch) => patch.type.startsWith('layer.') || patch.type === 'document.replace',
        )
      ) {
        renderer.syncLayers(Object.values(map.layersById));
      }
      if (patches.some((patch) => patch.type === 'document.replace') && map.document) {
        renderer.syncDocument(map.document);
      }
      for (const patch of patches) {
        if (patch.type === 'object.create' || patch.type === 'object.replace') {
          renderer.upsertObject(patch.object);
        } else if (patch.type === 'object.delete') {
          renderer.removeObject(patch.objectId);
        }
      }
      renderer.setSelection(selected);
      scheduleTelemetry();
    };
    const unsubscribeProjection = commandManager.patches.subscribe(applyProjectionPatch);
    const unsubscribeSelection = useEditorStore.subscribe((state, previous) => {
      if (state.selection !== previous.selection) renderer.setSelection(state.selection);
      if (state.tool !== previous.tool) {
        toolRef.current = state.tool;
        drawing = null;
        terrainGesture = null;
        gesture = null;
        renderer.clearPreview();
        renderer.previewGeometry(null);
        renderer.showMarquee(null);
        host.classList.remove('is-transforming');
      }
    });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const controller = new CameraController({
      minZoom: initialDocument.settings.camera.minZoom,
      maxZoom: initialDocument.settings.camera.maxZoom,
      onChange: ({ camera }: CameraSnapshot) => {
        telemetryCamera = camera;
        renderer.setCamera(camera);
        positionTextEditor();
        if (lastPointer) pointerWorld = controller.screenToWorld(lastPointer);
        scheduleTelemetry();
      },
    });

    const scheduleTelemetry = () => {
      if (telemetryTimer) return;
      telemetryTimer = window.setTimeout(() => {
        telemetryTimer = 0;
        onTelemetry({
          camera: telemetryCamera,
          pointerWorld,
          fps: renderer.getFps(),
          visibleObjectCount: renderer.getVisibleObjectCount(),
        });
      }, 100);
    };

    const resize = () => {
      const viewport = {
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
      };
      renderer.resize(viewport);
      controller.setViewport(viewport);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const reportError = (error: unknown) => {
      onInteractionError?.(error instanceof Error ? error.message : '操作失败，请重试。');
    };
    const closeTextEditor = () => {
      if (textEditor) renderer.clearTextPreview(textEditor.objectId);
      textEditor?.element.remove();
      textEditor = null;
    };
    const positionTextEditor = () => {
      if (!textEditor) return;
      const object = useMapStore.getState().objectsById[textEditor.objectId];
      if (object?.type !== 'text') return closeTextEditor();
      const screen = controller.worldToScreen({ x: object.x, y: object.y });
      const zoom = controller.getSnapshot().camera.zoom;
      const lines = textEditor.element.value.split('\n');
      const width = Math.max(
        80,
        Math.max(...lines.map((line) => Math.max(1, [...line].length))) *
          object.fontSize *
          0.68 *
          zoom +
          20,
      );
      const height = Math.max(38, lines.length * object.fontSize * 1.25 * zoom + 14);
      textEditor.element.style.left = `${screen.x}px`;
      textEditor.element.style.top = `${screen.y}px`;
      textEditor.element.style.width = `${width}px`;
      textEditor.element.style.height = `${height}px`;
      textEditor.element.style.fontSize = `${Math.max(12, object.fontSize * zoom)}px`;
      textEditor.element.style.fontFamily = themeRegistry.resolve(
        initialDocument.themeId,
      ).tokens.defaultFontFamily;
      textEditor.element.style.textAlign = object.align;
      textEditor.element.style.transform = `${object.align === 'left' ? 'translate(0, -50%)' : object.align === 'right' ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)'} rotate(${object.rotation}rad)`;
    };
    const commitTextEditor = (): boolean => {
      if (!textEditor) return true;
      const current = textEditor;
      const object = useMapStore.getState().objectsById[current.objectId];
      if (object?.type !== 'text') {
        closeTextEditor();
        return true;
      }
      const text = current.element.value.trim();
      if (!text) {
        closeTextEditor();
        return true;
      }
      try {
        if (text !== object.text)
          commandManager.execute(
            new UpdateObjectCommand(object.id, { text }, `inline-text:${object.id}`, 'Edit text'),
          );
        closeTextEditor();
        onInteractionError?.(null);
        return true;
      } catch (error) {
        reportError(error);
        current.element.focus();
        return false;
      }
    };
    const beginTextEditor = (object: Extract<MapObject, { type: 'text' }>) => {
      if (textEditor?.objectId === object.id) return;
      if (!commitTextEditor()) return;
      const element = window.document.createElement('textarea');
      element.className = 'canvas-text-editor';
      element.value = object.text;
      element.maxLength = 2_000;
      element.setAttribute('aria-label', '画布文字内容');
      element.addEventListener('pointerdown', (event) => event.stopPropagation());
      element.addEventListener('input', () => {
        renderer.previewText(object.id, element.value);
        positionTextEditor();
      });
      host.appendChild(element);
      textEditor = { element, objectId: object.id };
      useEditorStore.getState().setSelection([object.id]);
      positionTextEditor();
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    };
    const capture = (event: PointerEvent) => {
      if (event.isTrusted) host.setPointerCapture(event.pointerId);
    };
    const placeStamp = (point: WorldPoint, assetId: string) => {
      try {
        const object = createStampObject(
          initialDocument,
          assetId,
          point,
          controller.getSnapshot().camera.zoom,
        );
        if (commandManager.execute(new CreateObjectCommand(object))) {
          useEditorStore.getState().setSelection([object.id]);
          onInteractionError?.(null);
        }
      } catch (error) {
        reportError(error);
      }
    };
    const cancelGesture = () => {
      gesture = null;
      drawing = null;
      terrainGesture = null;
      renderer.clearPreview();
      renderer.previewGeometry(null);
      renderer.showMarquee(null);
      host.classList.remove('is-transforming');
    };
    const previewDrawing = () => {
      if (!drawing) return renderer.previewGeometry(null);
      if ((drawing.tool === 'region' && drawing.points.length < 3) || drawing.points.length < 2)
        return;
      try {
        renderer.previewGeometry(
          createGeometryObject(initialDocument, drawing.tool, drawing.points),
        );
      } catch {
        // Invalid intermediate polygons keep the last valid preview.
      }
    };
    const commitDrawing = (endpoint: WorldPoint) => {
      if (!drawing) return;
      const finished = drawing;
      drawing = null;
      renderer.previewGeometry(null);
      let points = finishFreehandPoints(
        finished.points,
        clampToMap(initialDocument, endpoint),
        finished.simplifyTolerance,
      );
      if (finished.tool === 'region' && points.length > 3) {
        const first = points[0]!;
        const last = points.at(-1)!;
        if (Math.hypot(last.x - first.x, last.y - first.y) <= finished.minimumDistance * 2) {
          points = points.slice(0, -1);
        }
      }
      if (finished.tool === 'region') points = freehandRegionVertices(points);
      const minimum = finished.tool === 'region' ? 3 : 2;
      if (points.length < minimum) return;
      try {
        const object = createGeometryObject(initialDocument, finished.tool, points);
        const command =
          object.type === 'path' ? new CreatePathCommand(object) : new CreateRegionCommand(object);
        if (commandManager.execute(command)) {
          useEditorStore.getState().setSelection([]);
          onInteractionError?.(null);
        }
      } catch (error) {
        reportError(
          finished.tool === 'region'
            ? new Error('无法形成有效区域，请避免轮廓完全重叠后重试。')
            : error,
        );
      }
    };
    const previewTerrainGesture = () => {
      if (!terrainGesture || (terrainGesture.mode === 'draw' && terrainGesture.points.length < 2))
        return renderer.previewGeometry(null);
      if (terrainGesture.mode === 'erase') {
        renderer.previewTerrainEraser(terrainGesture.points, terrainGesture.brush.radius);
        return;
      }
      try {
        renderer.previewGeometry(
          createTerrainObject(
            initialDocument,
            terrainGesture.terrainKind,
            terrainGesture.brush,
            terrainGesture.points,
            terrainGesture.layerId,
          ),
        );
      } catch {
        // Keep interaction responsive; commit reports schema and budget failures.
      }
    };
    const commitTerrainSegment = (
      target: TerrainGesture,
      sourcePoints: readonly TerrainStrokePoint[],
    ): string => {
      const points = fitTerrainStrokePayload(
        sourcePoints,
        target.brush,
        0.5 / controller.getSnapshot().camera.zoom,
      );
      const object = createTerrainObject(
        initialDocument,
        target.terrainKind,
        target.brush,
        points,
        target.layerId,
      );
      // createTerrainObject falls back to another editable raster layer if the
      // original one was removed while a very long pointer gesture was active.
      target.layerId = object.layerId;
      if (!commandManager.execute(new DrawTerrainStrokeCommand(object))) {
        throw new Error('地形笔迹未能写入画板，请重试。');
      }
      target.createdObjectIds.push(object.id);
      return object.id;
    };
    const addTerrainSample = (event: PointerEvent) => {
      if (!terrainGesture) return;
      const point = clampToMap(initialDocument, controller.screenToWorld(localPoint(event, host)));
      const pressure = event.pointerType === 'mouse' || event.pressure === 0 ? 0.5 : event.pressure;
      const spacing = Math.max(
        1 / controller.getSnapshot().camera.zoom,
        terrainGesture.brush.spacing,
      );
      terrainGesture.points = appendResampledSegment(
        terrainGesture.points,
        { ...point, pressure },
        spacing,
      );
      if (
        terrainGesture.mode === 'draw' &&
        terrainGesture.points.length >= terrainGesture.nextBudgetCheck
      ) {
        if (terrainStrokePayloadFits(terrainGesture.points, terrainGesture.brush)) {
          terrainGesture.nextBudgetCheck += 256;
        } else {
          const endpoint = terrainGesture.points.at(-1)!;
          commitTerrainSegment(terrainGesture, terrainGesture.points);
          // Retain the shared endpoint so separately persisted segments render
          // as one continuous stroke without a visible gap.
          terrainGesture.points = [endpoint];
          terrainGesture.nextBudgetCheck = 256;
          renderer.previewGeometry(null);
          onInteractionError?.(null);
        }
      }
    };
    const commitTerrainGesture = (event: PointerEvent) => {
      if (!terrainGesture) return;
      const finished = terrainGesture;
      terrainGesture = null;
      renderer.previewGeometry(null);
      try {
        const endpoint = clampToMap(
          initialDocument,
          controller.screenToWorld(localPoint(event, host)),
        );
        let points = finishResampledStroke(finished.points, endpoint);
        if (
          finished.mode === 'draw' &&
          finished.createdObjectIds.length > 0 &&
          points.length === 1
        ) {
          useEditorStore.getState().setSelection(finished.createdObjectIds);
          onInteractionError?.(null);
          return;
        }
        if (points.length === 1) {
          const pixel = 1 / controller.getSnapshot().camera.zoom;
          const direction = endpoint.x + pixel <= initialDocument.width ? pixel : -pixel;
          points = finishResampledStroke(
            points,
            clampToMap(initialDocument, { x: endpoint.x + direction, y: endpoint.y }),
          );
        }
        if (finished.mode === 'draw') {
          commitTerrainSegment(finished, points);
          useEditorStore.getState().setSelection(finished.createdObjectIds);
        } else {
          const map = useMapStore.getState();
          const hits = Object.values(map.objectsById).filter(
            (object): object is Extract<MapObject, { type: 'terrain-stroke' }> =>
              object.type === 'terrain-stroke' &&
              !object.locked &&
              object.visible &&
              isLayerEffectivelyEditable(object.layerId, map.layersById) &&
              strokeIntersectsEraser(object, points, finished.brush.radius),
          );
          const transaction = commandManager.beginTransaction('Erase terrain strokes');
          for (const object of hits) transaction.add(new DeleteObjectCommand(object.id));
          transaction.commit();
          useEditorStore.getState().setSelection([]);
        }
        onInteractionError?.(null);
      } catch (error) {
        reportError(error);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = localPoint(event, host);
      lastPointer = point;
      controller.zoomAt(
        point,
        event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY,
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      const screen = localPoint(event, host);
      lastPointer = screen;
      const world = controller.screenToWorld(screen);
      if (event.target === textEditor?.element) return;
      if (textEditor) {
        commitTextEditor();
        event.preventDefault();
        return;
      }
      if (
        event.button === 1 ||
        (event.button === 0 && (spacePressed || toolRef.current === 'pan'))
      ) {
        event.preventDefault();
        panning = true;
        panPointer = screen;
        capture(event);
        host.classList.add('is-panning');
        return;
      }
      if (event.button !== 0) return;
      if (toolRef.current === 'stamp') {
        event.preventDefault();
        placeStamp(world, assetRef.current);
        return;
      }
      if (toolRef.current === 'text') {
        event.preventDefault();
        try {
          const hit = renderer.pick(world);
          if (hit?.type === 'text') {
            useEditorStore.getState().setSelection([hit.id]);
            onInteractionError?.(null);
            return;
          }
          const object = createTextObject(initialDocument, world);
          commandManager.execute(new CreateObjectCommand(object));
          if (object.type === 'text') beginTextEditor(object);
          onInteractionError?.(null);
        } catch (error) {
          reportError(error);
        }
        return;
      }
      if (toolRef.current === 'location') {
        event.preventDefault();
        try {
          const { location, marker } = createLocationPair(initialDocument, world);
          commandManager.execute(new CreateLocationCommand(location, marker));
          useEditorStore.getState().setSelection([marker.id]);
          onInteractionError?.(null);
        } catch (error) {
          reportError(error);
        }
        return;
      }
      if (toolRef.current === 'terrain-brush' || toolRef.current === 'terrain-eraser') {
        event.preventDefault();
        const terrainLayerId = editableTerrainLayerId();
        if (!terrainLayerId) {
          reportError(new Error('请先创建或解锁一个可编辑的地形图层。'));
          return;
        }
        const settings = useEditorStore.getState();
        const point = clampToMap(initialDocument, world);
        terrainGesture = {
          mode: toolRef.current === 'terrain-brush' ? 'draw' : 'erase',
          terrainKind: settings.terrainKind,
          brush: { ...settings.terrainBrush },
          layerId: terrainLayerId,
          points: [
            {
              ...point,
              pressure:
                event.pointerType === 'mouse' || event.pressure === 0 ? 0.5 : event.pressure,
            },
          ],
          nextBudgetCheck: 256,
          createdObjectIds: [],
        };
        capture(event);
        previewTerrainGesture();
        return;
      }
      if (
        toolRef.current === 'road' ||
        toolRef.current === 'river' ||
        toolRef.current === 'region'
      ) {
        event.preventDefault();
        const layerType = toolRef.current === 'region' ? 'region' : 'vector-path';
        if (!editableGeometryLayerId(layerType)) {
          reportError(
            new Error(
              `请先创建或解锁一个可编辑的${toolRef.current === 'region' ? '区域' : '路径'}图层。`,
            ),
          );
          return;
        }
        const point = clampToMap(initialDocument, world);
        if (drawing?.tool === toolRef.current) {
          commitDrawing(point);
          return;
        }
        const zoom = controller.getSnapshot().camera.zoom;
        drawing = {
          tool: toolRef.current,
          points: [point],
          minimumDistance: (toolRef.current === 'region' ? 3 : 2.5) / zoom,
          simplifyTolerance: (toolRef.current === 'region' ? 1.75 : 1.25) / zoom,
        };
        useEditorStore.getState().setSelection([]);
        previewDrawing();
        return;
      }
      if (toolRef.current !== 'select') return;

      event.preventDefault();
      const selection = useEditorStore.getState().selection;
      const selectedObjects = selection
        .map((objectId) => useMapStore.getState().objectsById[objectId])
        .filter((object): object is MapObject => Boolean(object));
      const geometryNode = renderer.hitSelectedGeometryNode(world);
      if (geometryNode) {
        const object = useMapStore.getState().objectsById[geometryNode.objectId];
        if (object?.type === 'path' || object?.type === 'region') {
          gesture = {
            kind: 'geometry-node',
            object,
            nodeIndex: geometryNode.index,
            candidate: null,
          };
          capture(event);
          host.classList.add('is-transforming');
          return;
        }
      }
      const handle = renderer.hitSelectionHandle(world);
      if (handle && selectedObjects.length > 0) {
        const bounds = selectionBounds(selectedObjects);
        if (!bounds) return;
        gesture = {
          kind: 'transform',
          mode: handle,
          start: world,
          originals: selectedObjects,
          bounds,
          changes: null,
        };
        capture(event);
        host.classList.add('is-transforming');
        return;
      }

      const hit = renderer.pick(world);
      if (hit) {
        if (event.shiftKey && selection.includes(hit.id)) {
          useEditorStore
            .getState()
            .setSelection(selection.filter((objectId) => objectId !== hit.id));
          return;
        }
        const nextSelection = event.shiftKey
          ? [...new Set([...selection, hit.id])]
          : selection.includes(hit.id)
            ? selection
            : [hit.id];
        useEditorStore.getState().setSelection(nextSelection);
        if (hit.type === 'path' || hit.type === 'region' || hit.type === 'terrain-stroke') return;
        const originals = nextSelection
          .map((objectId) => useMapStore.getState().objectsById[objectId])
          .filter((object): object is MapObject => Boolean(object));
        const bounds = selectionBounds(originals);
        if (bounds) {
          gesture = {
            kind: 'transform',
            mode: 'move',
            start: world,
            originals,
            bounds,
            changes: null,
          };
          capture(event);
          host.classList.add('is-transforming');
        }
        return;
      }
      gesture = { kind: 'marquee', start: world, preserveSelection: event.shiftKey };
      if (!event.shiftKey) useEditorStore.getState().setSelection([]);
      capture(event);
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (textEditor || event.button !== 0) return;
      const world = controller.screenToWorld(localPoint(event, host));
      const hit = renderer.pick(world);
      if (hit?.type !== 'text') return;
      event.preventDefault();
      cancelGesture();
      beginTextEditor(hit);
      onInteractionError?.(null);
    };
    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event, host);
      const world = controller.screenToWorld(point);
      if (terrainGesture) {
        try {
          const coalesced = event.getCoalescedEvents?.() ?? [];
          const samples = coalesced.length > 0 ? coalesced : [event];
          for (const sample of samples) addTerrainSample(sample);
          previewTerrainGesture();
        } catch (error) {
          terrainGesture = null;
          renderer.previewGeometry(null);
          reportError(error);
        }
      } else if (panning && panPointer) {
        controller.panByScreen(point.x - panPointer.x, point.y - panPointer.y);
        panPointer = point;
      } else if (gesture?.kind === 'transform') {
        gesture.changes = transformedObjects(
          gesture.mode,
          gesture.start,
          world,
          gesture.originals,
          gesture.bounds,
        );
        renderer.previewTransforms(gesture.changes);
      } else if (gesture?.kind === 'marquee') {
        renderer.showMarquee(rectFromPoints(gesture.start, world));
      } else if (gesture?.kind === 'geometry-node') {
        const nodeGesture = gesture;
        const point = clampToMap(initialDocument, world);
        const candidate =
          nodeGesture.object.type === 'path'
            ? {
                ...nodeGesture.object,
                nodes: nodeGesture.object.nodes.map((node, index) =>
                  index === nodeGesture.nodeIndex ? { ...node, anchor: point } : node,
                ),
              }
            : {
                ...nodeGesture.object,
                vertices: nodeGesture.object.vertices.map((vertex, index) =>
                  index === nodeGesture.nodeIndex ? point : vertex,
                ),
              };
        const parsed = mapObjectSchema.safeParse(candidate);
        if (parsed.success && (parsed.data.type === 'path' || parsed.data.type === 'region')) {
          nodeGesture.candidate = parsed.data;
          renderer.previewGeometry(parsed.data);
        }
      } else if (drawing) {
        const coalesced = event.getCoalescedEvents?.() ?? [];
        const samples = coalesced.length > 0 ? coalesced : [event];
        for (const sample of samples) {
          const sampleWorld = clampToMap(
            initialDocument,
            controller.screenToWorld(localPoint(sample, host)),
          );
          drawing.points = appendFreehandPoint(
            drawing.points,
            sampleWorld,
            drawing.minimumDistance,
          );
        }
        previewDrawing();
      }
      lastPointer = point;
      pointerWorld = world;
      telemetryCamera = controller.getSnapshot().camera;
      scheduleTelemetry();
    };
    const endPointer = (event: PointerEvent) => {
      if (terrainGesture) {
        commitTerrainGesture(event);
      } else if (panning) {
        panning = false;
        panPointer = null;
        controller.flush();
        host.classList.remove('is-panning');
      } else if (gesture) {
        const finished = gesture;
        gesture = null;
        if (finished.kind === 'transform') {
          renderer.clearPreview();
          if (finished.changes) {
            try {
              commandManager.execute(new TransformObjectsCommand(finished.changes));
              onInteractionError?.(null);
            } catch (error) {
              reportError(error);
            }
          }
        } else if (finished.kind === 'geometry-node') {
          renderer.previewGeometry(null);
          if (finished.candidate) {
            try {
              commandManager.execute(
                finished.candidate.type === 'path'
                  ? new UpdatePathGeometryCommand(finished.candidate.id, finished.candidate.nodes)
                  : new UpdateRegionGeometryCommand(
                      finished.candidate.id,
                      finished.candidate.vertices,
                    ),
              );
              onInteractionError?.(null);
            } catch (error) {
              reportError(error);
            }
          }
        } else {
          const world = controller.screenToWorld(localPoint(event, host));
          const matches = renderer.objectsInRect(rectFromPoints(finished.start, world));
          const previous = finished.preserveSelection ? useEditorStore.getState().selection : [];
          useEditorStore.getState().setSelection([...new Set([...previous, ...matches])]);
          renderer.showMarquee(null);
        }
        host.classList.remove('is-transforming');
      }
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    };
    const cancelPointer = (event: PointerEvent) => {
      cancelGesture();
      panning = false;
      panPointer = null;
      host.classList.remove('is-panning');
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const assetId = event.dataTransfer?.getData('application/x-map-stamp') || assetRef.current;
      placeStamp(controller.screenToWorld(localPoint(event, host)), assetId);
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('application/x-map-stamp')) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (textEditor && event.target === textEditor.element) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          commitTextEditor();
          event.preventDefault();
        } else if (event.key === 'Escape') {
          closeTextEditor();
          event.preventDefault();
        }
        return;
      }
      if (
        event.code === 'Space' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        spacePressed = true;
        host.classList.add('is-pan-ready');
        event.preventDefault();
      }
      if (event.key === 'Enter' && drawing) {
        commitDrawing(drawing.points.at(-1)!);
        event.preventDefault();
      }
      if (event.key === 'Escape' && (gesture || drawing || terrainGesture)) {
        cancelGesture();
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressed = false;
        host.classList.remove('is-pan-ready');
      }
    };
    const onWindowPointerDown = (event: PointerEvent) => {
      if (textEditor && event.target !== textEditor.element && !host.contains(event.target as Node))
        commitTextEditor();
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endPointer);
    host.addEventListener('pointercancel', cancelPointer);
    host.addEventListener('dblclick', onDoubleClick);
    host.addEventListener('drop', onDrop);
    host.addEventListener('dragover', onDragOver);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onWindowPointerDown);

    void renderer.mount(host).then(() => {
      if (disposed) return;
      resize();
      syncProjection();
      controller.fit(
        { x: 0, y: 0, width: initialDocument.width, height: initialDocument.height },
        72,
        false,
      );
      onReady?.({
        zoomIn: () => controller.zoomBy(1.25),
        zoomOut: () => controller.zoomBy(0.8),
        fitMap: (animate = true) =>
          controller.fit(
            { x: 0, y: 0, width: initialDocument.width, height: initialDocument.height },
            72,
            animate && !reducedMotion,
          ),
        focusAt: (point, animate = true) =>
          controller.focus(
            { x: point.x - 32, y: point.y - 32, width: 64, height: 64 },
            160,
            animate && !reducedMotion,
          ),
        centerAt: (point, animate = true) =>
          controller.moveTo(
            { ...controller.getSnapshot().camera, x: point.x, y: point.y },
            animate && !reducedMotion,
          ),
        getExportMaxTextureSize: () => renderer.getExportMaxTextureSize(),
        exportPng: (longEdge) => renderer.exportPng(longEdge),
      });
    });

    return () => {
      disposed = true;
      observer.disconnect();
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endPointer);
      host.removeEventListener('pointercancel', cancelPointer);
      host.removeEventListener('dblclick', onDoubleClick);
      host.removeEventListener('drop', onDrop);
      host.removeEventListener('dragover', onDragOver);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onWindowPointerDown);
      closeTextEditor();
      if (telemetryTimer) window.clearTimeout(telemetryTimer);
      controller.destroy();
      unsubscribeProjection();
      unsubscribeSelection();
      renderer.destroy();
    };
  }, [commandManager, document.id, onInteractionError, onReady, onTelemetry]);

  return (
    <div
      className={`pixi-host ${tool === 'pan' ? 'is-pan-tool' : ''} ${tool === 'stamp' ? 'is-stamp-tool' : ''} ${['road', 'river', 'region'].includes(tool) ? 'is-geometry-tool' : ''} ${tool.startsWith('terrain-') ? 'is-terrain-tool' : ''}`}
      ref={hostRef}
      data-testid="pixi-host"
    />
  );
}
