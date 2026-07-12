import { describe, expect, it } from 'vitest';

import { createMapDocumentFixture, createMapDocumentV1Fixture } from './fixtures.js';
import {
  mapDocumentMigrationRegistry,
  migrateMapDocument,
  UnsupportedMapDocumentVersionError,
} from './migrations.js';

describe('map document migrations', () => {
  it('upgrades a v1 document without changing its map content', () => {
    expect(migrateMapDocument(createMapDocumentV1Fixture(), 1)).toEqual(createMapDocumentFixture());
    expect(mapDocumentMigrationRegistry.size).toBe(1);
  });

  it.each([0, 3, 99])('rejects unsupported source version %s', (version) => {
    expect(() => migrateMapDocument(createMapDocumentFixture(), version, 2)).toThrow(
      UnsupportedMapDocumentVersionError,
    );
  });

  it('rejects an unknown future target version', () => {
    expect(() => migrateMapDocument(createMapDocumentFixture(), 2, 3)).toThrow(
      UnsupportedMapDocumentVersionError,
    );
  });
});
