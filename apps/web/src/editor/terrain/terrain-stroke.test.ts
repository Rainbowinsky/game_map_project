import { describe, expect, it } from 'vitest';
import {
  hasByteLimit,
  MAX_OBJECT_PAYLOAD_BYTES,
  type TerrainStrokeMapObject,
} from '@fantasy-map/map-model';

import {
  appendResampledSegment,
  fitTerrainStrokePayload,
  finishResampledStroke,
  strokeIntersectsEraser,
  terrainStrokePayloadFits,
} from './terrain-stroke.js';

describe('terrain stroke sampling', () => {
  it('resamples long pointer movement at a stable world distance', () => {
    const points = appendResampledSegment(
      [{ x: 0, y: 0, pressure: 0 }],
      { x: 10, y: 0, pressure: 1 },
      2,
    );
    expect(points.map((point) => point.x)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(points[3]?.pressure).toBeCloseTo(0.6);
  });

  it('keeps the exact pointer-up coordinate for pixel-precise short strokes', () => {
    expect(finishResampledStroke([{ x: 1, y: 1 }], { x: 1.25, y: 1.5 })).toEqual([
      { x: 1, y: 1 },
      { x: 1.25, y: 1.5 },
    ]);
  });

  it('fails before exceeding the configured point budget', () => {
    expect(() => appendResampledSegment([{ x: 0, y: 0 }], { x: 5, y: 0 }, 1, 3)).toThrow(
      /cannot exceed 3/,
    );
  });

  it('adaptively simplifies a long stroke into the persistence byte budget', () => {
    const brush = { radius: 12, opacity: 0.8, spacing: 1, hardness: 0.5 };
    const points = Array.from({ length: 12_000 }, (_, index) => ({
      x: index / 4,
      y: 100 + Math.sin(index / 200) * 0.1,
      pressure: 0.5,
    }));
    expect(hasByteLimit({ brush, points }, MAX_OBJECT_PAYLOAD_BYTES)).toBe(false);
    const fitted = fitTerrainStrokePayload(points, brush, 0.5);
    expect(fitted.length).toBeLessThan(points.length);
    expect(fitted[0]).toEqual(points[0]);
    expect(fitted.at(-1)).toEqual(points.at(-1));
    expect(hasByteLimit({ brush, points: fitted }, MAX_OBJECT_PAYLOAD_BYTES)).toBe(true);
    expect(terrainStrokePayloadFits(fitted, brush)).toBe(true);
  });
});

describe('terrain eraser hit testing', () => {
  it('hits a stroke using both brush radii', () => {
    const stroke = {
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
      ],
      brush: { radius: 5, opacity: 1, spacing: 1, hardness: 1 },
    } as TerrainStrokeMapObject;
    const center = stroke.points[0]!;
    expect(
      strokeIntersectsEraser(stroke, [{ x: center.x, y: center.y + stroke.brush.radius + 3 }], 4),
    ).toBe(true);
    expect(
      strokeIntersectsEraser(stroke, [{ x: center.x, y: center.y + stroke.brush.radius + 10 }], 4),
    ).toBe(false);
    expect(strokeIntersectsEraser(stroke, [{ x: 100, y: 10 }], 4)).toBe(false);
  });
});
