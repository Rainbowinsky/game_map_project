import {
  hasByteLimit,
  MAX_OBJECT_PAYLOAD_BYTES,
  MAX_TERRAIN_STROKE_POINTS,
  type TerrainBrush,
  type TerrainStrokeMapObject,
  type TerrainStrokePoint,
  type WorldPoint,
} from '@fantasy-map/map-model';

const EPSILON = 1e-9;

export interface StrokeSample extends WorldPoint {
  readonly pressure?: number;
}

function pointLineDistance(point: WorldPoint, start: WorldPoint, end: WorldPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const squared = dx * dx + dy * dy;
  if (squared <= EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared),
  );
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

/** Iterative Ramer-Douglas-Peucker simplification avoids recursion on very long gestures. */
export function simplifyTerrainStroke(
  points: readonly TerrainStrokePoint[],
  tolerance: number,
): TerrainStrokePoint[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];
  const kept = new Uint8Array(points.length);
  kept[0] = 1;
  kept[points.length - 1] = 1;
  const ranges: [number, number][] = [[0, points.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    const start = points[startIndex]!;
    const end = points[endIndex]!;
    let furthestIndex = -1;
    let furthestDistance = tolerance;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = points[index]!;
      const geometryDistance = pointLineDistance(point, start, end);
      const progress = (index - startIndex) / (endIndex - startIndex);
      const expectedPressure =
        (start.pressure ?? 0.5) + ((end.pressure ?? 0.5) - (start.pressure ?? 0.5)) * progress;
      const pressureDistance = Math.abs((point.pressure ?? 0.5) - expectedPressure) * tolerance * 4;
      const distance = Math.max(geometryDistance, pressureDistance);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex >= 0) {
      kept[furthestIndex] = 1;
      ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }
  return points.filter((_, index) => kept[index] === 1);
}

export function fitTerrainStrokePayload(
  points: readonly TerrainStrokePoint[],
  brush: TerrainBrush,
  initialTolerance: number,
): TerrainStrokePoint[] {
  if (hasByteLimit({ brush, points }, MAX_OBJECT_PAYLOAD_BYTES)) return [...points];
  let tolerance = Math.max(initialTolerance, 0.000_001);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const simplified = simplifyTerrainStroke(points, tolerance);
    if (hasByteLimit({ brush, points: simplified }, MAX_OBJECT_PAYLOAD_BYTES)) return simplified;
    tolerance *= 1.6;
  }
  const endpoints = [points[0]!, points.at(-1)!];
  if (hasByteLimit({ brush, points: endpoints }, MAX_OBJECT_PAYLOAD_BYTES)) return endpoints;
  throw new RangeError('这条地形笔迹过长，请分成多次绘制。');
}

export function terrainStrokePayloadFits(
  points: readonly TerrainStrokePoint[],
  brush: TerrainBrush,
): boolean {
  return hasByteLimit({ brush, points }, MAX_OBJECT_PAYLOAD_BYTES);
}

export function appendResampledSegment(
  points: readonly TerrainStrokePoint[],
  target: StrokeSample,
  spacing: number,
  maxPoints = MAX_TERRAIN_STROKE_POINTS,
): TerrainStrokePoint[] {
  if (!Number.isFinite(spacing) || spacing <= 0)
    throw new RangeError('Stroke spacing must be positive.');
  if (points.length === 0) return [{ ...target }];
  const result = [...points];
  const start = result.at(-1)!;
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < spacing || distance <= EPSILON) return result;
  const count = Math.floor(distance / spacing);
  for (let step = 1; step <= count; step += 1) {
    if (result.length >= maxPoints)
      throw new RangeError(`Terrain stroke cannot exceed ${maxPoints} points.`);
    const ratio = Math.min(1, (step * spacing) / distance);
    const pressure =
      start.pressure === undefined && target.pressure === undefined
        ? undefined
        : (start.pressure ?? 0.5) + ((target.pressure ?? 0.5) - (start.pressure ?? 0.5)) * ratio;
    result.push({
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
      ...(pressure === undefined ? {} : { pressure }),
    });
  }
  return result;
}

export function finishResampledStroke(
  points: readonly TerrainStrokePoint[],
  target: StrokeSample,
  maxPoints = MAX_TERRAIN_STROKE_POINTS,
): TerrainStrokePoint[] {
  if (points.length === 0) return [{ ...target }];
  const last = points.at(-1)!;
  if (Math.hypot(last.x - target.x, last.y - target.y) <= EPSILON) return [...points];
  if (points.length >= maxPoints)
    throw new RangeError(`Terrain stroke cannot exceed ${maxPoints} points.`);
  return [...points, { ...target }];
}

function pointSegmentDistance(point: WorldPoint, start: WorldPoint, end: WorldPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const squared = dx * dx + dy * dy;
  const ratio =
    squared <= EPSILON
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared));
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

function segmentsDistance(a: WorldPoint, b: WorldPoint, c: WorldPoint, d: WorldPoint): number {
  const cross = (p: WorldPoint, q: WorldPoint, r: WorldPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: WorldPoint, q: WorldPoint, r: WorldPoint) =>
    Math.abs(cross(p, q, r)) <= EPSILON &&
    r.x >= Math.min(p.x, q.x) - EPSILON &&
    r.x <= Math.max(p.x, q.x) + EPSILON &&
    r.y >= Math.min(p.y, q.y) - EPSILON &&
    r.y <= Math.max(p.y, q.y) + EPSILON;
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const properIntersection =
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
  if (
    properIntersection ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  )
    return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

export function strokeIntersectsEraser(
  stroke: TerrainStrokeMapObject,
  eraserPoints: readonly WorldPoint[],
  eraserRadius: number,
): boolean {
  if (eraserPoints.length === 0) return false;
  const threshold = eraserRadius + stroke.brush.radius;
  const strokeSegments =
    stroke.points.length === 1
      ? [[stroke.points[0]!, stroke.points[0]!] as const]
      : stroke.points.slice(1).map((point, index) => [stroke.points[index]!, point] as const);
  const eraserSegments =
    eraserPoints.length === 1
      ? [[eraserPoints[0]!, eraserPoints[0]!] as const]
      : eraserPoints.slice(1).map((point, index) => [eraserPoints[index]!, point] as const);
  return eraserSegments.some(([a, b]) =>
    strokeSegments.some(([c, d]) => segmentsDistance(a, b, c, d) <= threshold),
  );
}
