import type {
  MapLayer,
  MapObject,
  ObjectTransform,
  WorldPoint,
  WorldRect,
} from '@fantasy-map/map-model';

import { STAMP_INTRINSIC_SIZE } from '../../assets/stamp-assets.js';
import { isLayerEffectivelyEditable } from '../layers/layer-tree.js';

const EPSILON = 0.000_001;

function pathHitSegments(object: Extract<MapObject, { type: 'path' }>): [WorldPoint, WorldPoint][] {
  const segments: [WorldPoint, WorldPoint][] = [];
  for (let index = 1; index < object.nodes.length; index += 1) {
    const previous = object.nodes[index - 1]!;
    const current = object.nodes[index]!;
    if (!previous.handleOut && !current.handleIn) {
      segments.push([previous.anchor, current.anchor]);
      continue;
    }
    const p0 = previous.anchor;
    const p1 = previous.handleOut
      ? { x: p0.x + previous.handleOut.x, y: p0.y + previous.handleOut.y }
      : p0;
    const p3 = current.anchor;
    const p2 = current.handleIn
      ? { x: p3.x + current.handleIn.x, y: p3.y + current.handleIn.y }
      : p3;
    let last = p0;
    for (let step = 1; step <= 16; step += 1) {
      const t = step / 16;
      const inverse = 1 - t;
      const next = {
        x:
          inverse ** 3 * p0.x +
          3 * inverse ** 2 * t * p1.x +
          3 * inverse * t ** 2 * p2.x +
          t ** 3 * p3.x,
        y:
          inverse ** 3 * p0.y +
          3 * inverse ** 2 * t * p1.y +
          3 * inverse * t ** 2 * p2.y +
          t ** 3 * p3.y,
      };
      segments.push([last, next]);
      last = next;
    }
  }
  return segments;
}

export type TransformMode = 'move' | 'scale' | 'rotate';

export function objectBounds(object: MapObject): WorldRect {
  if (object.type === 'path' || object.type === 'region' || object.type === 'terrain-stroke') {
    const points =
      object.type === 'path'
        ? object.nodes.flatMap((node) => [
            node.anchor,
            ...(node.handleIn
              ? [{ x: node.anchor.x + node.handleIn.x, y: node.anchor.y + node.handleIn.y }]
              : []),
            ...(node.handleOut
              ? [{ x: node.anchor.x + node.handleOut.x, y: node.anchor.y + node.handleOut.y }]
              : []),
          ])
        : object.type === 'region'
          ? object.vertices
          : object.points;
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    const padding =
      object.type === 'path'
        ? Math.max(object.widthStart, object.widthEnd) / 2
        : object.type === 'region'
          ? object.strokeWidth
          : object.brush.radius;
    return {
      x: left - padding,
      y: top - padding,
      width: Math.max(EPSILON, right - left + padding * 2),
      height: Math.max(EPSILON, bottom - top + padding * 2),
    };
  }
  const halfWidth = (STAMP_INTRINSIC_SIZE * Math.abs(object.scaleX)) / 2;
  const halfHeight = (STAMP_INTRINSIC_SIZE * Math.abs(object.scaleY)) / 2;
  const cosine = Math.abs(Math.cos(object.rotation));
  const sine = Math.abs(Math.sin(object.rotation));
  const width = Math.max(EPSILON, halfWidth * cosine + halfHeight * sine) * 2;
  const height = Math.max(EPSILON, halfWidth * sine + halfHeight * cosine) * 2;
  return { x: object.x - width / 2, y: object.y - height / 2, width, height };
}

export function selectionBounds(objects: readonly MapObject[]): WorldRect | null {
  if (objects.length === 0) return null;
  const bounds = objects.map(objectBounds);
  const left = Math.min(...bounds.map((rect) => rect.x));
  const top = Math.min(...bounds.map((rect) => rect.y));
  const right = Math.max(...bounds.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...bounds.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function rectFromPoints(start: WorldPoint, end: WorldPoint): WorldRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(EPSILON, Math.abs(end.x - start.x)),
    height: Math.max(EPSILON, Math.abs(end.y - start.y)),
  };
}

export function rectsIntersect(left: WorldRect, right: WorldRect): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

export function pointInObject(point: WorldPoint, object: MapObject): boolean {
  if (object.type === 'region') {
    let inside = false;
    for (
      let index = 0, previous = object.vertices.length - 1;
      index < object.vertices.length;
      previous = index++
    ) {
      const currentPoint = object.vertices[index]!;
      const previousPoint = object.vertices[previous]!;
      if (
        currentPoint.y > point.y !== previousPoint.y > point.y &&
        point.x <
          ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
            (previousPoint.y - currentPoint.y) +
            currentPoint.x
      )
        inside = !inside;
    }
    return inside;
  }
  if (object.type === 'path') {
    const tolerance = Math.max(6, object.widthStart / 2, object.widthEnd / 2);
    return pathHitSegments(object).some(([start, end]) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const t =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
            );
      return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy)) <= tolerance;
    });
  }
  if (object.type === 'terrain-stroke') {
    return object.points.slice(1).some((end, index) => {
      const start = object.points[index]!;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const squared = dx * dx + dy * dy;
      const ratio =
        squared === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared),
            );
      return (
        Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy)) <=
        object.brush.radius
      );
    });
  }
  const dx = point.x - object.x;
  const dy = point.y - object.y;
  const cosine = Math.cos(-object.rotation);
  const sine = Math.sin(-object.rotation);
  const localX = dx * cosine - dy * sine;
  const localY = dx * sine + dy * cosine;
  return (
    Math.abs(localX) <= (STAMP_INTRINSIC_SIZE * Math.abs(object.scaleX)) / 2 &&
    Math.abs(localY) <= (STAMP_INTRINSIC_SIZE * Math.abs(object.scaleY)) / 2
  );
}

function layerRanks(layers: readonly MapLayer[]): Map<string, number> {
  const children = new Map<string | null, MapLayer[]>();
  for (const layer of layers) {
    const siblings = children.get(layer.parentId) ?? [];
    siblings.push(layer);
    children.set(layer.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.order - b.order);
  const ranks = new Map<string, number>();
  let rank = 0;
  const visit = (parentId: string | null) => {
    for (const layer of children.get(parentId) ?? []) {
      ranks.set(layer.id, rank++);
      visit(layer.id);
    }
  };
  visit(null);
  return ranks;
}

export function pickObject(
  point: WorldPoint,
  objects: readonly MapObject[],
  layers: readonly MapLayer[],
): MapObject | undefined {
  const layersById = Object.fromEntries(layers.map((layer) => [layer.id, layer]));
  const ranks = layerRanks(layers);
  return objects
    .filter(
      (object) =>
        object.visible &&
        !object.locked &&
        isLayerEffectivelyEditable(object.layerId, layersById) &&
        pointInObject(point, object),
    )
    .sort(
      (left, right) =>
        (ranks.get(right.layerId) ?? -1) - (ranks.get(left.layerId) ?? -1) ||
        right.zIndex - left.zIndex ||
        right.id.localeCompare(left.id),
    )[0];
}

export function objectsIntersectingRect(
  rect: WorldRect,
  objects: readonly MapObject[],
  layers: readonly MapLayer[],
): string[] {
  const layersById = Object.fromEntries(layers.map((layer) => [layer.id, layer]));
  return objects
    .filter(
      (object) =>
        object.visible &&
        !object.locked &&
        isLayerEffectivelyEditable(object.layerId, layersById) &&
        rectsIntersect(rect, objectBounds(object)),
    )
    .map((object) => object.id);
}

export function transformedObjects(
  mode: TransformMode,
  start: WorldPoint,
  current: WorldPoint,
  originals: readonly MapObject[],
  commonBounds: WorldRect,
): Readonly<Record<string, ObjectTransform>> {
  const center = {
    x: commonBounds.x + commonBounds.width / 2,
    y: commonBounds.y + commonBounds.height / 2,
  };
  const result: Record<string, ObjectTransform> = {};
  if (mode === 'move') {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    for (const object of originals) {
      result[object.id] = { ...object, x: object.x + dx, y: object.y + dy };
    }
    return result;
  }
  if (mode === 'rotate') {
    const delta =
      Math.atan2(current.y - center.y, current.x - center.x) -
      Math.atan2(start.y - center.y, start.x - center.x);
    const cosine = Math.cos(delta);
    const sine = Math.sin(delta);
    for (const object of originals) {
      const dx = object.x - center.x;
      const dy = object.y - center.y;
      result[object.id] = {
        ...object,
        x: center.x + dx * cosine - dy * sine,
        y: center.y + dx * sine + dy * cosine,
        rotation: object.rotation + delta,
      };
    }
    return result;
  }
  const startDistance = Math.max(EPSILON, Math.hypot(start.x - center.x, start.y - center.y));
  const factor = Math.max(
    0.01,
    Math.hypot(current.x - center.x, current.y - center.y) / startDistance,
  );
  for (const object of originals) {
    result[object.id] = {
      ...object,
      x: center.x + (object.x - center.x) * factor,
      y: center.y + (object.y - center.y) * factor,
      scaleX: Math.min(1_024, Math.max(0.001, object.scaleX * factor)),
      scaleY: Math.min(1_024, Math.max(0.001, object.scaleY * factor)),
    };
  }
  return result;
}
