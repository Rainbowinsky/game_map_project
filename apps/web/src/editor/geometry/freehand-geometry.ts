import type { PathNode, WorldPoint } from '@fantasy-map/map-model';

function distanceToSegment(point: WorldPoint, start: WorldPoint, end: WorldPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy));
}

export function appendFreehandPoint(
  points: readonly WorldPoint[],
  point: WorldPoint,
  minimumDistance: number,
): readonly WorldPoint[] {
  const last = points.at(-1);
  if (!last) return [point];
  if (Math.hypot(point.x - last.x, point.y - last.y) < minimumDistance) return points;
  return [...points, point];
}

export function finishFreehandPoints(
  points: readonly WorldPoint[],
  endpoint: WorldPoint,
  tolerance: number,
): WorldPoint[] {
  const withEndpoint = [...points];
  const last = withEndpoint.at(-1);
  if (!last || last.x !== endpoint.x || last.y !== endpoint.y) withEndpoint.push(endpoint);
  if (withEndpoint.length <= 2) return withEndpoint;

  const keep = new Uint8Array(withEndpoint.length);
  keep[0] = 1;
  keep[withEndpoint.length - 1] = 1;
  const ranges: Array<[number, number]> = [[0, withEndpoint.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    let furthestIndex = -1;
    let furthestDistance = tolerance;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distanceToSegment(
        withEndpoint[index]!,
        withEndpoint[startIndex]!,
        withEndpoint[endIndex]!,
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex >= 0) {
      keep[furthestIndex] = 1;
      ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }
  return withEndpoint.filter((_, index) => keep[index] === 1);
}

/** Converts a sampled pointer stroke into a smooth editable Catmull-Rom-style path. */
export function freehandPathNodes(points: readonly WorldPoint[]): PathNode[] {
  return points.map((anchor, index) => {
    const previous = points[index - 1] ?? anchor;
    const next = points[index + 1] ?? anchor;
    const tangent = { x: (next.x - previous.x) / 6, y: (next.y - previous.y) / 6 };
    return {
      anchor,
      ...(index > 0
        ? {
            handleIn: {
              x: tangent.x === 0 ? 0 : -tangent.x,
              y: tangent.y === 0 ? 0 : -tangent.y,
            },
          }
        : {}),
      ...(index < points.length - 1 ? { handleOut: tangent } : {}),
    };
  });
}

function orientation(first: WorldPoint, second: WorldPoint, third: WorldPoint): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function properlyIntersects(
  firstStart: WorldPoint,
  firstEnd: WorldPoint,
  secondStart: WorldPoint,
  secondEnd: WorldPoint,
): boolean {
  const epsilon = 1e-9;
  const first = orientation(firstStart, firstEnd, secondStart);
  const second = orientation(firstStart, firstEnd, secondEnd);
  const third = orientation(secondStart, secondEnd, firstStart);
  const fourth = orientation(secondStart, secondEnd, firstEnd);
  return (
    ((first > epsilon && second < -epsilon) || (first < -epsilon && second > epsilon)) &&
    ((third > epsilon && fourth < -epsilon) || (third < -epsilon && fourth > epsilon))
  );
}

function onSegment(start: WorldPoint, end: WorldPoint, point: WorldPoint): boolean {
  const epsilon = 1e-9;
  return (
    Math.abs(orientation(start, end, point)) <= epsilon &&
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  );
}

function intersects(
  firstStart: WorldPoint,
  firstEnd: WorldPoint,
  secondStart: WorldPoint,
  secondEnd: WorldPoint,
): boolean {
  return (
    properlyIntersects(firstStart, firstEnd, secondStart, secondEnd) ||
    onSegment(firstStart, firstEnd, secondStart) ||
    onSegment(firstStart, firstEnd, secondEnd) ||
    onSegment(secondStart, secondEnd, firstStart) ||
    onSegment(secondStart, secondEnd, firstEnd)
  );
}

function hasCrossing(points: readonly WorldPoint[]): boolean {
  for (let first = 0; first < points.length; first += 1) {
    const firstEnd = (first + 1) % points.length;
    for (let second = first + 2; second < points.length; second += 1) {
      const secondEnd = (second + 1) % points.length;
      if (first === 0 && secondEnd === 0) continue;
      if (intersects(points[first]!, points[firstEnd]!, points[second]!, points[secondEnd]!))
        return true;
    }
  }
  return false;
}

function convexHull(points: readonly WorldPoint[]): WorldPoint[] {
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const half = (source: readonly WorldPoint[]) => {
    const result: WorldPoint[] = [];
    for (const point of source) {
      while (
        result.length >= 2 &&
        orientation(result[result.length - 2]!, result[result.length - 1]!, point) <= 0
      )
        result.pop();
      result.push(point);
    }
    return result;
  };
  const lower = half(sorted);
  const upper = half(sorted.reverse());
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Removes repeated samples and applies polygon 2-opt until no two non-adjacent
 * edges cross. This preserves the hand-drawn outline much better than replacing
 * it with a convex hull while guaranteeing ordinary lasso loops are untangled.
 */
export function freehandRegionVertices(points: readonly WorldPoint[]): WorldPoint[] {
  const unique: WorldPoint[] = [];
  for (const point of points) {
    if (
      unique.some(
        (candidate) =>
          Math.abs(candidate.x - point.x) <= 1e-9 && Math.abs(candidate.y - point.y) <= 1e-9,
      )
    )
      continue;
    unique.push(point);
  }
  if (unique.length < 4) return unique;

  const limit = unique.length * unique.length;
  for (let pass = 0; pass < limit; pass += 1) {
    let crossing: [number, number] | null = null;
    for (let first = 0; first < unique.length && !crossing; first += 1) {
      const firstEnd = (first + 1) % unique.length;
      for (let second = first + 2; second < unique.length; second += 1) {
        const secondEnd = (second + 1) % unique.length;
        if (first === 0 && secondEnd === 0) continue;
        if (
          properlyIntersects(unique[first]!, unique[firstEnd]!, unique[second]!, unique[secondEnd]!)
        ) {
          crossing = [first, second];
          break;
        }
      }
    }
    if (!crossing) return hasCrossing(unique) ? convexHull(unique) : unique;
    const [first, second] = crossing;
    const replacement = unique.slice(first + 1, second + 1).reverse();
    unique.splice(first + 1, replacement.length, ...replacement);
  }
  return hasCrossing(unique) ? convexHull(unique) : unique;
}
