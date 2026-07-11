import { describe, expect, it } from 'vitest';

import {
  PNG_EXPORT_MAX_PIXELS,
  createPngExportPlan,
  pngLongEdgeOptions,
  safePngFilename,
} from './png-export-plan.js';

describe('createPngExportPlan', () => {
  it('uses the selected long edge and preserves a landscape map ratio', () => {
    expect(createPngExportPlan(24_000, 16_000, 2048)).toMatchObject({
      outputWidth: 2048,
      outputHeight: 1365,
      wasReduced: false,
    });
  });

  it('uses the selected output edge even when the world units are smaller', () => {
    expect(createPngExportPlan(400, 200, 2048)).toMatchObject({
      outputWidth: 2048,
      outputHeight: 1024,
      wasReduced: false,
    });
  });

  it('caps a request at the device texture limit before allocating', () => {
    const plan = createPngExportPlan(100_000, 80_000, 4096, { deviceMaxTextureSize: 2048 });

    expect(plan).toMatchObject({ maxLongEdge: 2048, outputWidth: 2048, outputHeight: 1638 });
    expect(plan.wasReduced).toBe(true);
  });

  it('downsamples proportionally when a pixel budget is tighter than the edge cap', () => {
    const plan = createPngExportPlan(10_000, 10_000, 4096, { maxPixels: 1_000_000 });

    expect(plan.outputWidth).toBe(1000);
    expect(plan.outputHeight).toBe(1000);
    expect(plan.pixelCount).toBeLessThanOrEqual(1_000_000);
    expect(plan.estimatedMemoryBytes).toBe(plan.pixelCount * 8);
  });

  it('never lets the default configured plan exceed the global pixel ceiling', () => {
    const plan = createPngExportPlan(1_000_000, 1_000_000, 99_999);

    expect(plan.pixelCount).toBeLessThanOrEqual(PNG_EXPORT_MAX_PIXELS);
    expect(plan.outputWidth).toBeLessThanOrEqual(4096);
  });
});

describe('PNG export presentation helpers', () => {
  it('offers only safe resolution choices', () => {
    expect(pngLongEdgeOptions(1536)).toEqual([1024, 1536]);
  });

  it('normalizes untrusted map names into safe PNG filenames', () => {
    expect(safePngFilename(' ../Ashes: Coast?.png ')).toBe('Ashes-Coast-png.png');
    expect(safePngFilename('')).toBe('fantasy-map.png');
  });
});
