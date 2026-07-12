import {
  mapObjectSchema,
  type MapObject,
  type PathMapObject,
  type RegionMapObject,
  type TerrainStrokeMapObject,
} from '@fantasy-map/map-model';
import {
  createPathMapObjectFixture,
  createRegionMapObjectFixture,
  createTerrainStrokeMapObjectFixture,
} from '@fantasy-map/map-model/fixtures';

export const GEOMETRY_BENCHMARK_COUNTS = [500, 2_000] as const;

const width = 100_000;
const height = 80_000;

function benchmarkId(index: number): string {
  return `40000000-0000-4000-8000-${(index + 10_000).toString().padStart(12, '0')}`;
}

function translatedObject(index: number): MapObject {
  const columns = 50;
  const x = 800 + (index % columns) * 1_960;
  const y = 800 + Math.floor(index / columns) * 1_720;
  const base = {
    id: benchmarkId(index),
    x,
    y,
    zIndex: index,
    chunk: { x: Math.floor(x / 1_024), y: Math.floor(y / 1_024) },
  };
  if (index % 3 === 0) {
    const seed = createTerrainStrokeMapObjectFixture();
    return {
      ...seed,
      ...base,
      points: seed.points.map((point, pointIndex) => ({
        ...point,
        x: x + pointIndex * 130,
        y: y + pointIndex * 80,
      })),
    } satisfies TerrainStrokeMapObject;
  }
  if (index % 3 === 1) {
    const seed = createPathMapObjectFixture();
    return {
      ...seed,
      ...base,
      nodes: seed.nodes.map((node, nodeIndex) => ({
        ...node,
        anchor: { x: x + nodeIndex * 420, y: y + nodeIndex * 240 },
      })),
    } satisfies PathMapObject;
  }
  const seed = createRegionMapObjectFixture();
  return {
    ...seed,
    ...base,
    vertices: [
      { x, y },
      { x: x + 460, y: y + 70 },
      { x: x + 260, y: y + 460 },
    ],
  } satisfies RegionMapObject;
}

/** A fixed mixed-geometry scene used for reproducible minimap observations. */
export function createGeometryBenchmarkObjects(count: number): MapObject[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 2_000) {
    throw new RangeError('Benchmark geometry count must be an integer between 1 and 2,000.');
  }
  return Array.from({ length: count }, (_, index) =>
    mapObjectSchema.parse(translatedObject(index)),
  );
}

export const GEOMETRY_BENCHMARK_WORLD = { width, height } as const;
