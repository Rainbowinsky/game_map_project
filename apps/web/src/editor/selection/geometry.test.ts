import { describe, expect, it } from 'vitest';
import {
  createMapDocumentFixture,
  createPathMapObjectFixture,
  createRegionMapObjectFixture,
  createStampMapObjectFixture,
  createTextMapObjectFixture,
} from '@fantasy-map/map-model/fixtures';

import {
  objectBounds,
  objectsIntersectingRect,
  pickObject,
  selectionBounds,
  transformedObjects,
  pointInObject,
} from './geometry.js';

describe('selection geometry', () => {
  it('picks the top editable object and filters hidden or locked layers', () => {
    const document = createMapDocumentFixture();
    const base = createStampMapObjectFixture();
    const top = { ...base, id: '10000000-0000-4000-8000-000000000020', zIndex: 4 };
    expect(pickObject({ x: base.x, y: base.y }, [base, top], document.layers)?.id).toBe(top.id);

    const hiddenLayers = document.layers.map((layer) =>
      layer.id === base.layerId ? { ...layer, visible: false } : layer,
    );
    expect(pickObject({ x: base.x, y: base.y }, [base], hiddenLayers)).toBeUndefined();
  });

  it('calculates multi-selection bounds and rectangular intersection', () => {
    const document = createMapDocumentFixture();
    const first = createStampMapObjectFixture();
    const second = {
      ...first,
      id: '10000000-0000-4000-8000-000000000021',
      x: first.x + 400,
    };
    const bounds = selectionBounds([first, second]);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(objectBounds(first).width);
    expect(objectsIntersectingRect(bounds!, [first, second], document.layers)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('moves, uniformly scales and rotates a multi-selection around common bounds', () => {
    const first = createStampMapObjectFixture();
    const second = {
      ...first,
      id: '10000000-0000-4000-8000-000000000022',
      x: first.x + 400,
    };
    const bounds = selectionBounds([first, second])!;
    const moved = transformedObjects(
      'move',
      { x: 0, y: 0 },
      { x: 25, y: -10 },
      [first, second],
      bounds,
    );
    expect(moved[first.id]).toMatchObject({ x: first.x + 25, y: first.y - 10 });

    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const scaled = transformedObjects(
      'scale',
      { x: center.x + 100, y: center.y },
      { x: center.x + 200, y: center.y },
      [first, second],
      bounds,
    );
    expect(scaled[first.id]!.scaleX).toBeCloseTo(first.scaleX * 2);
    expect(Math.abs(scaled[second.id]!.x - center.x)).toBeCloseTo(
      Math.abs(second.x - center.x) * 2,
    );

    const rotated = transformedObjects(
      'rotate',
      { x: center.x + 100, y: center.y },
      { x: center.x, y: center.y + 100 },
      [first],
      bounds,
    );
    expect(rotated[first.id]!.rotation).toBeCloseTo(first.rotation + Math.PI / 2);
  });

  it('uses path segments and polygon interiors for geometry picking', () => {
    const path = createPathMapObjectFixture();
    const region = createRegionMapObjectFixture();

    expect(pointInObject({ x: 320, y: 358 }, path)).toBe(true);
    expect(pointInObject({ x: 350, y: 430 }, path)).toBe(false);
    expect(pointInObject({ x: 1500, y: 1300 }, region)).toBe(true);
    expect(pointInObject({ x: 900, y: 900 }, region)).toBe(false);
    expect(objectBounds(region)).toMatchObject({ x: 997, y: 997 });
  });

  it('uses the rendered text range instead of the fixed stamp hit box', () => {
    const text = { ...createTextMapObjectFixture(), text: 'Daily life annotation', fontSize: 24, align: 'left' as const, rotation: 0, scaleX: 1, scaleY: 1 };
    const bounds = objectBounds(text);
    expect(bounds.width).toBeGreaterThan(200);
    expect(pointInObject({ x: text.x + 180, y: text.y }, text)).toBe(true);
    expect(pointInObject({ x: text.x - 10, y: text.y }, text)).toBe(false);
  });
});
