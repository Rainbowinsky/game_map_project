import { describe, expect, it } from 'vitest';

import { fitToMap, screenToWorld, visibleWorldRect, worldToScreen, zoomAtPoint } from './camera.js';

describe('camera math', () => {
  const viewport = { width: 1_280, height: 720 };

  it.each([
    [
      { x: 0, y: 0, zoom: 1 },
      { x: 0, y: 0 },
    ],
    [
      { x: 200, y: -50, zoom: 0.25 },
      { x: -400, y: 900 },
    ],
    [
      { x: -25_000, y: 8_000, zoom: 12 },
      { x: -24_999.5, y: 7_998.25 },
    ],
  ])('round-trips world and screen coordinates', (camera, world) => {
    const screen = worldToScreen(world, camera, viewport);
    const roundTrip = screenToWorld(screen, camera, viewport);

    expect(roundTrip.x).toBeCloseTo(world.x, 10);
    expect(roundTrip.y).toBeCloseTo(world.y, 10);
  });

  it('keeps the pointer world anchor fixed while zooming', () => {
    const camera = { x: 50, y: -100, zoom: 0.5 };
    const pointer = { x: 317, y: 599 };
    const before = screenToWorld(pointer, camera, viewport);
    const nextCamera = zoomAtPoint({
      camera,
      pointer,
      viewport,
      nextZoom: 4,
      minZoom: 0.02,
      maxZoom: 16,
    });
    const after = screenToWorld(pointer, nextCamera, viewport);

    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('fits the whole map using the limiting viewport axis', () => {
    expect(
      fitToMap({
        map: { x: -500, y: 100, width: 1_000, height: 500 },
        viewport: { width: 1_000, height: 600 },
        padding: 50,
        minZoom: 0.02,
        maxZoom: 16,
      }),
    ).toEqual({ x: 0, y: 350, zoom: 0.9 });
  });

  it('returns the visible world rectangle', () => {
    expect(visibleWorldRect({ x: 0, y: 0, zoom: 2 }, { width: 800, height: 600 })).toEqual({
      x: -200,
      y: -150,
      width: 400,
      height: 300,
    });
  });
});
