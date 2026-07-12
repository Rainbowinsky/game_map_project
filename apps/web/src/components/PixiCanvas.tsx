import { useEffect, useRef } from 'react';
import {
  mapObjectSchema,
  toChunkCoordinate,
  type CameraState,
  type MapDocument,
  type MapObject,
  type PathKind,
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
  TransformObjectsCommand,
  UpdatePathGeometryCommand,
  UpdateRegionGeometryCommand,
} from '../editor/commands/commands.js';
import type { CommandManager } from '../editor/commands/CommandManager.js';
import type { PatchEvent } from '../editor/commands/patch-bus.js';
import { isLayerEffectivelyEditable } from '../editor/layers/layer-tree.js';
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
  readonly points: readonly WorldPoint[];
  readonly hover: WorldPoint;
}

function localPoint(
  event: PointerEvent | WheelEvent | DragEvent,
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
    opacity: 1,
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
          strokeWidth: 3,
        }
      : {
          ...base,
          type: 'path',
          pathKind: tool as PathKind,
          nodes: points.map((anchor) => ({ anchor })),
          styleToken: `path.${tool}`,
          widthStart: tool === 'river' ? 14 : 8,
          widthEnd: tool === 'river' ? 24 : 8,
        },
  ) as Extract<MapObject, { type: 'path' | 'region' }>;
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
    });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const controller = new CameraController({
      minZoom: initialDocument.settings.camera.minZoom,
      maxZoom: initialDocument.settings.camera.maxZoom,
      onChange: ({ camera }: CameraSnapshot) => {
        telemetryCamera = camera;
        renderer.setCamera(camera);
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
      renderer.clearPreview();
      renderer.previewGeometry(null);
      renderer.showMarquee(null);
      host.classList.remove('is-transforming');
    };
    const previewDrawing = () => {
      if (!drawing) return renderer.previewGeometry(null);
      const points = [...drawing.points, drawing.hover];
      if ((drawing.tool === 'region' && points.length < 3) || points.length < 2) return;
      try {
        renderer.previewGeometry(createGeometryObject(initialDocument, drawing.tool, points));
      } catch {
        // Invalid intermediate polygons keep the last valid preview.
      }
    };
    const commitDrawing = () => {
      if (!drawing) return;
      const finished = drawing;
      drawing = null;
      renderer.previewGeometry(null);
      const minimum = finished.tool === 'region' ? 3 : 2;
      if (finished.points.length < minimum) return;
      try {
        const object = createGeometryObject(initialDocument, finished.tool, finished.points);
        const command =
          object.type === 'path' ? new CreatePathCommand(object) : new CreateRegionCommand(object);
        if (commandManager.execute(command)) {
          useEditorStore.getState().setSelection([object.id]);
          useEditorStore.getState().setTool('select');
          onInteractionError?.(null);
        }
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
      if (
        toolRef.current === 'road' ||
        toolRef.current === 'river' ||
        toolRef.current === 'region'
      ) {
        event.preventDefault();
        const point = clampToMap(initialDocument, world);
        if (!drawing || drawing.tool !== toolRef.current) {
          drawing = { tool: toolRef.current, points: [point], hover: point };
          capture(event);
          previewDrawing();
          return;
        }
        const first = drawing.points[0]!;
        const last = drawing.points.at(-1)!;
        const tolerance = 10 / controller.getSnapshot().camera.zoom;
        const closesRegion =
          drawing.tool === 'region' &&
          drawing.points.length >= 3 &&
          Math.hypot(point.x - first.x, point.y - first.y) <= tolerance;
        const doubleClick =
          event.detail >= 2 && Math.hypot(point.x - last.x, point.y - last.y) <= tolerance;
        if (closesRegion || doubleClick) {
          commitDrawing();
        } else {
          drawing = { ...drawing, points: [...drawing.points, point], hover: point };
          previewDrawing();
        }
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
        if (hit.type === 'path' || hit.type === 'region') return;
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
    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event, host);
      const world = controller.screenToWorld(point);
      if (panning && panPointer) {
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
        drawing = { ...drawing, hover: clampToMap(initialDocument, world) };
        previewDrawing();
      }
      lastPointer = point;
      pointerWorld = world;
      telemetryCamera = controller.getSnapshot().camera;
      scheduleTelemetry();
    };
    const endPointer = (event: PointerEvent) => {
      if (panning) {
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
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const assetId = event.dataTransfer?.getData('application/x-map-stamp') || assetRef.current;
      placeStamp(controller.screenToWorld(localPoint(event, host)), assetId);
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('application/x-map-stamp')) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code === 'Space' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        spacePressed = true;
        host.classList.add('is-pan-ready');
        event.preventDefault();
      }
      if (event.key === 'Enter' && drawing) {
        commitDrawing();
        event.preventDefault();
      }
      if (event.key === 'Escape' && (gesture || drawing)) {
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

    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endPointer);
    host.addEventListener('pointercancel', endPointer);
    host.addEventListener('drop', onDrop);
    host.addEventListener('dragover', onDragOver);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

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
      host.removeEventListener('pointercancel', endPointer);
      host.removeEventListener('drop', onDrop);
      host.removeEventListener('dragover', onDragOver);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (telemetryTimer) window.clearTimeout(telemetryTimer);
      controller.destroy();
      unsubscribeProjection();
      unsubscribeSelection();
      renderer.destroy();
    };
  }, [commandManager, document.id, onInteractionError, onReady, onTelemetry]);

  return (
    <div
      className={`pixi-host ${tool === 'pan' ? 'is-pan-tool' : ''} ${tool === 'stamp' ? 'is-stamp-tool' : ''} ${['road', 'river', 'region'].includes(tool) ? 'is-geometry-tool' : ''}`}
      ref={hostRef}
      data-testid="pixi-host"
    />
  );
}
