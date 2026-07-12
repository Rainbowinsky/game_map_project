import {
  MAX_TERRAIN_STROKE_POINTS,
  type TerrainStrokeMapObject,
  type TerrainStrokePoint,
  type WorldPoint,
} from '@fantasy-map/map-model';

const EPSILON = 1e-9;

export interface StrokeSample extends WorldPoint {
  readonly pressure?: number;
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
