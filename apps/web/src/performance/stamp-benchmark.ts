import type { StampMapObject } from '@fantasy-map/map-model';

export const STAMP_BENCHMARK_COUNTS = [2_000, 5_000] as const;

export interface StampBenchmarkOptions {
  readonly mapId?: string;
  readonly layerId?: string;
  readonly width?: number;
  readonly height?: number;
}

const defaultMapId = '30000000-0000-4000-8000-000000000001';
const defaultLayerId = '30000000-0000-4000-8000-000000000002';
const timestamp = '2026-07-12T00:00:00.000Z';
const benchmarkAssets = [
  { id: '20000000-0000-4000-8000-000000000001', kind: 'mountain' },
  { id: '20000000-0000-4000-8000-000000000002', kind: 'tree' },
  { id: '20000000-0000-4000-8000-000000000003', kind: 'town' },
] as const;

function benchmarkId(index: number): string {
  return `30000000-0000-4000-8000-${(index + 10_000).toString().padStart(12, '0')}`;
}

/**
 * Produces a fixed, evenly distributed scene for repeatable projection and
 * browser measurements. It deliberately reuses the three shipped textures.
 */
export function createStampBenchmarkObjects(
  count: number,
  options: StampBenchmarkOptions = {},
): StampMapObject[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 50_000) {
    throw new RangeError('Benchmark stamp count must be an integer between 1 and 50,000.');
  }
  const mapId = options.mapId ?? defaultMapId;
  const layerId = options.layerId ?? defaultLayerId;
  const width = options.width ?? 100_000;
  const height = options.height ?? 80_000;
  const columns = Math.ceil(Math.sqrt(count * (width / height)));
  const rows = Math.ceil(count / columns);
  const xStep = width / (columns + 1);
  const yStep = height / (rows + 1);

  return Array.from({ length: count }, (_, index) => {
    const asset = benchmarkAssets[index % benchmarkAssets.length]!;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = Math.round((column + 1) * xStep);
    const y = Math.round((row + 1) * yStep);
    return {
      id: benchmarkId(index),
      mapId,
      layerId,
      chunk: { x: Math.floor(x / 1_024), y: Math.floor(y / 1_024) },
      type: 'stamp',
      name: `Benchmark ${index + 1}`,
      x,
      y,
      rotation: (index % 12) * (Math.PI / 6),
      scaleX: 0.75 + (index % 5) * 0.1,
      scaleY: 0.75 + (index % 5) * 0.1,
      zIndex: index,
      visible: true,
      locked: false,
      opacity: 1,
      metadata: { benchmark: true },
      revision: 0,
      assetId: asset.id,
      stampKind: asset.kind,
      tint: null,
      flipX: index % 7 === 0,
      flipY: index % 11 === 0,
      randomSeed: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}
