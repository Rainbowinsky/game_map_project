import { describe, expect, it } from 'vitest';

import {
  chunkBounds,
  chunkKey,
  chunksIntersectingRect,
  parseChunkKey,
  toChunkCoordinate,
} from './chunks.js';

describe('chunk math', () => {
  it.each([
    [-1_025, -2],
    [-1_024, -1],
    [-1, -1],
    [0, 0],
    [1_023, 0],
    [1_024, 1],
  ])('uses mathematical floor for coordinate %s', (coordinate, expectedChunk) => {
    expect(toChunkCoordinate({ x: coordinate, y: coordinate }, 1_024)).toEqual({
      x: expectedChunk,
      y: expectedChunk,
    });
  });

  it('round-trips signed chunk keys', () => {
    expect(parseChunkKey(chunkKey({ x: -12, y: 34 }))).toEqual({ x: -12, y: 34 });
    expect(() => parseChunkKey('12,34')).toThrow(TypeError);
  });

  it('calculates chunk bounds', () => {
    expect(chunkBounds({ x: -2, y: 3 }, 512)).toEqual({
      x: -1_024,
      y: 1_536,
      width: 512,
      height: 512,
    });
  });

  it('does not include the next chunk when a rect ends on its boundary', () => {
    expect(chunksIntersectingRect({ x: 0, y: 0, width: 1_024, height: 1_024 })).toEqual([
      { x: 0, y: 0 },
    ]);
  });

  it('enumerates chunks across negative and positive space', () => {
    expect(chunksIntersectingRect({ x: -1_024, y: 0, width: 2_048, height: 512 })).toEqual([
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});
