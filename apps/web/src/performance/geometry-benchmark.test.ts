import { mapObjectSchema } from '@fantasy-map/map-model';
import { describe, expect, it } from 'vitest';

import { createGeometryBenchmarkObjects, GEOMETRY_BENCHMARK_COUNTS } from './geometry-benchmark.js';

describe('deterministic geometry benchmark fixtures', () => {
  it.each(GEOMETRY_BENCHMARK_COUNTS)('creates %i valid, repeatable geometry objects', (count) => {
    const first = createGeometryBenchmarkObjects(count);
    const second = createGeometryBenchmarkObjects(count);

    expect(first).toHaveLength(count);
    expect(second).toEqual(first);
    expect(() => first.forEach((object) => mapObjectSchema.parse(object))).not.toThrow();
    expect(new Set(first.map((object) => object.type))).toEqual(
      new Set(['terrain-stroke', 'path', 'region']),
    );
  });

  it('rejects counts beyond the P2 observation envelope', () => {
    expect(() => createGeometryBenchmarkObjects(0)).toThrow(RangeError);
    expect(() => createGeometryBenchmarkObjects(2_001)).toThrow(RangeError);
  });
});
