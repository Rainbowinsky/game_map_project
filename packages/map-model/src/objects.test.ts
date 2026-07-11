import { describe, expect, it } from 'vitest';

import { createStampMapObjectFixture, invalidStampMapObjectFixtures } from './fixtures.js';
import { MAX_METADATA_BYTES, stampMapObjectSchema } from './objects.js';

describe('stampMapObjectSchema', () => {
  it('accepts the standalone stamp fixture', () => {
    expect(stampMapObjectSchema.parse(createStampMapObjectFixture())).toEqual(
      createStampMapObjectFixture(),
    );
  });

  it.each(invalidStampMapObjectFixtures)('rejects invalid stamp data', (fixture) => {
    expect(() => stampMapObjectSchema.parse(fixture)).toThrow();
  });

  it('rejects unknown fields and non-JSON metadata', () => {
    expect(() =>
      stampMapObjectSchema.parse({ ...createStampMapObjectFixture(), databaseRowId: 1 }),
    ).toThrow();
    expect(() =>
      stampMapObjectSchema.parse({
        ...createStampMapObjectFixture(),
        metadata: { invalid: Number.POSITIVE_INFINITY },
      }),
    ).toThrow();
  });

  it('limits serialized metadata size', () => {
    expect(() =>
      stampMapObjectSchema.parse({
        ...createStampMapObjectFixture(),
        metadata: { text: '界'.repeat(MAX_METADATA_BYTES) },
      }),
    ).toThrow(/Metadata/);
  });
});
