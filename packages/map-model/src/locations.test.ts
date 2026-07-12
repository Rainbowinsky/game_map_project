import { describe, expect, it } from 'vitest';

import { createLocationFixture } from './fixtures.js';
import { locationChangesSchema, locationSchema } from './locations.js';

describe('location schemas', () => {
  it('accepts the standalone location fixture', () => {
    expect(locationSchema.parse(createLocationFixture())).toEqual(createLocationFixture());
  });

  it('rejects invalid zoom ranges, duplicate tags and protected fields', () => {
    expect(() =>
      locationSchema.parse({ ...createLocationFixture(), minZoom: 4, maxZoom: 1 }),
    ).toThrow();
    expect(() =>
      locationSchema.parse({ ...createLocationFixture(), tags: ['Town', 'town'] }),
    ).toThrow();
    expect(() =>
      locationChangesSchema.parse({ markerObjectId: createLocationFixture().id }),
    ).toThrow();
  });
});
