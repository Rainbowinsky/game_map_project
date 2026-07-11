import { describe, expect, it } from 'vitest';
import { MAX_CAMERA_ZOOM } from '@fantasy-map/map-model';

import {
  STAMP_INTRINSIC_SIZE,
  STAMP_PLACEMENT_SCREEN_SIZE,
  stampPlacementScale,
} from './stamp-assets.js';

function placedScreenSize(zoom: number): number {
  return STAMP_INTRINSIC_SIZE * stampPlacementScale(zoom) * zoom;
}

describe('stamp placement scale', () => {
  it('keeps newly placed stamps at a stable visual size across normal zoom levels', () => {
    for (const zoom of [0.02, 0.1, 1, 4, 16]) {
      expect(placedScreenSize(zoom)).toBeCloseTo(STAMP_PLACEMENT_SCREEN_SIZE);
    }
    expect(stampPlacementScale(16)).toBeLessThan(stampPlacementScale(1));
  });

  it('does not become invisibly small at the maximum supported camera zoom', () => {
    expect(placedScreenSize(MAX_CAMERA_ZOOM)).toBeGreaterThanOrEqual(STAMP_PLACEMENT_SCREEN_SIZE);
  });

  it('rejects invalid camera zoom values', () => {
    expect(() => stampPlacementScale(0)).toThrow(RangeError);
    expect(() => stampPlacementScale(Number.NaN)).toThrow(RangeError);
  });
});
