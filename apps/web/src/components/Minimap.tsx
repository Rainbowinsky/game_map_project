import { useEffect, useRef, useState } from 'react';
import type {
  CameraState,
  MapDocument,
  MapObject,
  ThemeTokens,
  Viewport,
  WorldPoint,
} from '@fantasy-map/map-model';

import {
  clampCameraCenter,
  createMinimapViewport,
  minimapCameraRect,
  minimapToWorld,
  worldToMinimap,
} from '../editor/minimap/minimap-projection.js';

const minimapSize = { width: 220, height: 148 } as const;

interface MinimapProps {
  readonly document: MapDocument;
  readonly objects: Readonly<Record<string, MapObject>>;
  readonly camera: CameraState;
  readonly canvasViewport: Viewport;
  readonly theme: ThemeTokens;
  readonly onCenterAt: (point: WorldPoint) => void;
}

function hexColor(value: string, alpha = 1): string {
  if (alpha === 1) return value;
  const numeric = Number.parseInt(value.slice(1), 16);
  return `rgba(${(numeric >> 16) & 255}, ${(numeric >> 8) & 255}, ${numeric & 255}, ${alpha})`;
}

function terrainColor(object: Extract<MapObject, { type: 'terrain-stroke' }>, theme: ThemeTokens) {
  if (object.brush.color) return object.brush.color;
  return object.terrainKind === 'water'
    ? theme.river
    : object.terrainKind === 'forest'
      ? theme.regionStroke
      : object.terrainKind === 'mountain'
        ? theme.coast
        : object.terrainKind === 'desert'
          ? theme.regionFill
          : theme.land;
}

function layerVisibility(document: MapDocument): ReadonlyMap<string, boolean> {
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]));
  return new Map(
    document.layers.map((layer) => {
      let visible = layer.visible;
      let parentId = layer.parentId;
      while (visible && parentId) {
        const parent = layers.get(parentId);
        visible = Boolean(parent?.visible);
        parentId = parent?.parentId ?? null;
      }
      return [layer.id, visible];
    }),
  );
}

function drawObject(
  context: CanvasRenderingContext2D,
  object: MapObject,
  project: (point: WorldPoint) => { x: number; y: number },
  scale: number,
  theme: ThemeTokens,
): void {
  context.globalAlpha = Math.max(0.18, object.opacity);
  if (object.type === 'region') {
    const [first, ...rest] = object.vertices.map(project);
    if (!first) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.closePath();
    context.fillStyle = hexColor(theme.regionFill, 0.55);
    context.strokeStyle = theme.regionStroke;
    context.lineWidth = Math.max(0.75, object.strokeWidth * scale);
    context.fill();
    context.stroke();
  } else if (object.type === 'path') {
    const [first, ...rest] = object.nodes.map((node) => project(node.anchor));
    if (!first) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.strokeStyle = object.pathKind === 'river' ? theme.river : theme.road;
    context.lineWidth = Math.max(0.75, Math.max(object.widthStart, object.widthEnd) * scale);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
  } else if (object.type === 'terrain-stroke') {
    const [first, ...rest] = object.points.map(project);
    if (!first) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.strokeStyle = terrainColor(object, theme);
    context.lineWidth = Math.max(1, object.brush.radius * 2 * scale);
    context.lineCap = 'round';
    context.stroke();
  } else {
    const point = project(object);
    const radius = object.type === 'marker' ? 3.2 : object.type === 'text' ? 2.4 : 2;
    context.fillStyle = object.type === 'marker' ? theme.coast : theme.text;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

export function Minimap({
  document,
  objects,
  camera,
  canvasViewport,
  theme,
  onCenterAt,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const [open, setOpen] = useState(true);
  const minimapViewport = createMinimapViewport(document, minimapSize);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = minimapSize.width * dpr;
    canvas.height = minimapSize.height * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, minimapSize.width, minimapSize.height);
    context.fillStyle = theme.ocean;
    context.fillRect(0, 0, minimapSize.width, minimapSize.height);
    context.fillStyle = theme.land;
    context.fillRect(
      minimapViewport.offsetX,
      minimapViewport.offsetY,
      minimapViewport.width,
      minimapViewport.height,
    );
    const visibleLayers = layerVisibility(document);
    const project = (point: WorldPoint) => worldToMinimap(point, minimapViewport);
    for (const object of Object.values(objects)) {
      if (object.visible && visibleLayers.get(object.layerId))
        drawObject(context, object, project, minimapViewport.scale, theme);
    }
    const visible = minimapCameraRect(camera, canvasViewport, document);
    const rect = worldToMinimap(visible, minimapViewport);
    context.fillStyle = hexColor(theme.selection, 0.13);
    context.strokeStyle = theme.selection;
    context.lineWidth = 1.5;
    context.fillRect(
      rect.x,
      rect.y,
      visible.width * minimapViewport.scale,
      visible.height * minimapViewport.scale,
    );
    context.strokeRect(
      rect.x,
      rect.y,
      visible.width * minimapViewport.scale,
      visible.height * minimapViewport.scale,
    );
    context.strokeStyle = hexColor(theme.text, 0.8);
    context.lineWidth = 1;
    context.strokeRect(
      minimapViewport.offsetX,
      minimapViewport.offsetY,
      minimapViewport.width,
      minimapViewport.height,
    );
  }, [camera, canvasViewport, document, minimapViewport, objects, open, theme]);

  const pointFromEvent = (
    event: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>,
  ): WorldPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return minimapToWorld(
      {
        x: ((event.clientX - bounds.left) / bounds.width) * minimapSize.width,
        y: ((event.clientY - bounds.top) / bounds.height) * minimapSize.height,
      },
      minimapViewport,
      document,
    );
  };
  const centerAt = (point: WorldPoint) =>
    onCenterAt(clampCameraCenter(point, camera, canvasViewport, document));
  const nudge = (x: number, y: number) => {
    centerAt({ x: camera.x + document.width * x, y: camera.y + document.height * y });
  };

  return (
    <section className={`minimap ${open ? '' : 'minimap--closed'}`} aria-label="缩略导航">
      <div className="minimap__header">
        <span>缩略导航</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="map-minimap-canvas"
          aria-label={open ? '隐藏缩略导航' : '显示缩略导航'}
        >
          {open ? '隐藏' : '显示'}
        </button>
      </div>
      {open && (
        <canvas
          id="map-minimap-canvas"
          ref={canvasRef}
          className="minimap__canvas"
          data-testid="minimap-canvas"
          width={minimapSize.width}
          height={minimapSize.height}
          role="button"
          tabIndex={0}
          aria-label="缩略导航图。点击或拖动可定位画布；使用方向键移动视图，Home 键回到地图中心。"
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            centerAt(pointFromEvent(event));
          }}
          onClick={(event) => {
            centerAt(pointFromEvent(event));
          }}
          onPointerMove={(event) => {
            if (draggingRef.current) centerAt(pointFromEvent(event));
          }}
          onPointerUp={(event) => {
            draggingRef.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.2 : 0.08;
            const moves: Record<string, readonly [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            if (event.key === 'Home') {
              event.preventDefault();
              centerAt({ x: document.width / 2, y: document.height / 2 });
            } else if (moves[event.key]) {
              event.preventDefault();
              const [x, y] = moves[event.key]!;
              nudge(x, y);
            }
          }}
        />
      )}
    </section>
  );
}
