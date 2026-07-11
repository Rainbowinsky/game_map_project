import { describe, expect, it } from 'vitest';

import { createMapDocumentFixture } from './fixtures.js';
import {
  mapDocumentMigrationRegistry,
  migrateMapDocument,
  UnsupportedMapDocumentVersionError,
} from './migrations.js';

describe('map document migrations', () => {
  it('validates a v1 document without applying a migration', () => {
    expect(migrateMapDocument(createMapDocumentFixture(), 1, 1)).toEqual(
      createMapDocumentFixture(),
    );
    expect(mapDocumentMigrationRegistry.size).toBe(0);
  });

  it.each([0, 2, 99])('rejects unsupported source version %s', (version) => {
    expect(() => migrateMapDocument(createMapDocumentFixture(), version, 1)).toThrow(
      UnsupportedMapDocumentVersionError,
    );
  });

  it('rejects an unknown future target version', () => {
    expect(() => migrateMapDocument(createMapDocumentFixture(), 1, 2)).toThrow(
      UnsupportedMapDocumentVersionError,
    );
  });
});
