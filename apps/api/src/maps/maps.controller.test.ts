import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { MAP_CHUNK_READ_THROTTLE, MapsController } from './maps.controller.js';

describe('MapsController chunk read throttling', () => {
  it('gives normal batched map loading a separate high read budget', () => {
    for (const handler of [
      MapsController.prototype.listChunks,
      MapsController.prototype.getChunk,
    ]) {
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(
        MAP_CHUNK_READ_THROTTLE.limit,
      );
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(
        MAP_CHUNK_READ_THROTTLE.ttl,
      );
    }
  });
});
