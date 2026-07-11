import { mapObjectSchema } from '@fantasy-map/map-model';
import { describe, expect, it } from 'vitest';

import { STAMP_ASSETS } from '../assets/stamp-assets.js';
import { createStampBenchmarkObjects, STAMP_BENCHMARK_COUNTS } from './stamp-benchmark.js';

describe('deterministic stamp benchmark fixtures', () => {
  it.each(STAMP_BENCHMARK_COUNTS)('creates %i valid, repeatable stamps', (count) => {
    const first = createStampBenchmarkObjects(count);
    const second = createStampBenchmarkObjects(count);

    expect(first).toHaveLength(count);
    expect(second).toEqual(first);
    expect(() => first.forEach((object) => mapObjectSchema.parse(object))).not.toThrow();
    expect(new Set(first.map((object) => object.assetId)).size).toBe(3);
    expect(new Set(first.map((object) => object.assetId))).toEqual(
      new Set(STAMP_ASSETS.map((asset) => asset.id)),
    );
  });

  it('rejects counts beyond the defined benchmark envelope', () => {
    expect(() => createStampBenchmarkObjects(0)).toThrow(RangeError);
    expect(() => createStampBenchmarkObjects(50_001)).toThrow(RangeError);
  });
});
