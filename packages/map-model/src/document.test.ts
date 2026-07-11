import { describe, expect, it } from 'vitest';

import { mapDocumentSchema } from './document.js';
import {
  createMapDocumentFixture,
  FIXTURE_IDS,
  FIXTURE_TIMESTAMP,
  invalidMapDocumentFixtures,
} from './fixtures.js';

describe('mapDocumentSchema', () => {
  it('accepts the standalone valid fixture', () => {
    expect(mapDocumentSchema.parse(createMapDocumentFixture())).toEqual(createMapDocumentFixture());
  });

  it.each(invalidMapDocumentFixtures)('rejects an invalid document fixture', (fixture) => {
    expect(() => mapDocumentSchema.parse(fixture)).toThrow();
  });

  it('rejects non-finite dimensions and unknown fields', () => {
    expect(() =>
      mapDocumentSchema.parse({
        ...createMapDocumentFixture(),
        width: Number.NaN,
      }),
    ).toThrow();
    expect(() =>
      mapDocumentSchema.parse({
        ...createMapDocumentFixture(),
        privateDatabaseId: 42,
      }),
    ).toThrow();
  });

  it('rejects a layer hierarchy cycle', () => {
    const firstGroupId = '20000000-0000-4000-8000-000000000001';
    const secondGroupId = '20000000-0000-4000-8000-000000000002';
    const layerBase = {
      mapId: FIXTURE_IDS.map,
      name: 'Group',
      type: 'group' as const,
      order: 0,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      createdAt: FIXTURE_TIMESTAMP,
      updatedAt: FIXTURE_TIMESTAMP,
    };

    expect(() =>
      mapDocumentSchema.parse({
        ...createMapDocumentFixture(),
        layers: [
          { ...layerBase, id: firstGroupId, parentId: secondGroupId },
          { ...layerBase, id: secondGroupId, parentId: firstGroupId },
        ],
      }),
    ).toThrow(/cycle/i);
  });
});
