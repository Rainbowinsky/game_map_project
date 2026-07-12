import { createMapDocumentFixture } from '@fantasy-map/map-model/fixtures';
import { describe, expect, it } from 'vitest';

import {
  clampCameraCenter,
  createMinimapViewport,
  minimapCameraRect,
  minimapToWorld,
  worldToMinimap,
} from './minimap-projection.js';

describe('minimap projection', () => {
  const document = createMapDocumentFixture();
  const size = { width: 220, height: 148 };

  it('preserves world coordinates through the fitted minimap viewport', () => {
    const viewport = createMinimapViewport(document, size);
    const source = { x: 25_000, y: 45_000 };
    const screen = worldToMinimap(source, viewport);

    expect(minimapToWorld(screen, viewport, document)).toEqual(source);
    expect(viewport.width).toBeLessThanOrEqual(size.width);
    expect(viewport.height).toBeLessThanOrEqual(size.height);
  });

  it('clips the visible camera rectangle to the map boundary', () => {
    expect(
      minimapCameraRect({ x: 100, y: 100, zoom: 1 }, { width: 1_000, height: 800 }, document),
    ).toEqual({ x: 0, y: 0, width: 600, height: 500 });
  });

  it('keeps minimap navigation within the current camera boundary', () => {
    expect(
      clampCameraCenter(
        { x: -100, y: 90_000 },
        { x: 50_000, y: 40_000, zoom: 1 },
        { width: 1_000, height: 800 },
        document,
      ),
    ).toEqual({ x: 500, y: 79_600 });
  });
});
