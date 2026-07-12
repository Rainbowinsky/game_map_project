import { describe, expect, it } from 'vitest';

import {
  appendFreehandPoint,
  finishFreehandPoints,
  freehandPathNodes,
  freehandRegionVertices,
} from './freehand-geometry.js';
import { createRegionMapObjectFixture } from '@fantasy-map/map-model/fixtures';
import { regionMapObjectSchema } from '@fantasy-map/map-model';

describe('freehand geometry', () => {
  it('samples by distance and simplifies redundant pointer events', () => {
    let points = appendFreehandPoint([], { x: 0, y: 0 }, 4);
    points = appendFreehandPoint(points, { x: 2, y: 0 }, 4);
    points = appendFreehandPoint(points, { x: 5, y: 0 }, 4);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);

    expect(
      finishFreehandPoints(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0.1 },
          { x: 10, y: 0 },
        ],
        { x: 10, y: 0 },
        0.5,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('adds relative curve handles while preserving sampled anchors', () => {
    const nodes = freehandPathNodes([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(nodes.map((node) => node.anchor)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(nodes[1]).toMatchObject({
      handleIn: { x: -10 / 3, y: 0 },
      handleOut: { x: 10 / 3, y: 0 },
    });
  });

  it('untangles a self-crossing lasso before region validation', () => {
    const vertices = freehandRegionVertices([
      { x: 1000, y: 1000 },
      { x: 1800, y: 1800 },
      { x: 1000, y: 1800 },
      { x: 1800, y: 1000 },
      { x: 1000, y: 1000 },
    ]);
    expect(vertices).toHaveLength(4);
    expect(
      regionMapObjectSchema.safeParse({ ...createRegionMapObjectFixture(), vertices }).success,
    ).toBe(true);
  });
});
