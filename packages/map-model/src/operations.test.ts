import { describe, expect, it } from 'vitest';

import { createApplyOperationsRequestFixture, FIXTURE_IDS } from './fixtures.js';
import { applyOperationsRequestSchema, mapOperationSchema } from './operations.js';

describe('operation schemas', () => {
  it('accepts a valid operation batch', () => {
    expect(applyOperationsRequestSchema.parse(createApplyOperationsRequestFixture())).toEqual(
      createApplyOperationsRequestFixture(),
    );
  });

  it('rejects protected and unknown object update fields', () => {
    expect(() =>
      mapOperationSchema.parse({
        type: 'object.update',
        objectId: FIXTURE_IDS.object,
        changes: { id: FIXTURE_IDS.asset },
      }),
    ).toThrow();
  });

  it('rejects empty operation batches and empty changes', () => {
    expect(() =>
      applyOperationsRequestSchema.parse({
        ...createApplyOperationsRequestFixture(),
        operations: [],
      }),
    ).toThrow();
    expect(() =>
      mapOperationSchema.parse({
        type: 'object.update',
        objectId: FIXTURE_IDS.object,
        changes: {},
      }),
    ).toThrow();
  });

  it('requires a target layer only for the move deletion policy', () => {
    expect(() =>
      mapOperationSchema.parse({
        type: 'layer.delete',
        layerId: FIXTURE_IDS.stampLayer,
        objectPolicy: 'move',
      }),
    ).toThrow();
    expect(() =>
      mapOperationSchema.parse({
        type: 'layer.delete',
        layerId: FIXTURE_IDS.stampLayer,
        objectPolicy: 'delete',
        targetLayerId: FIXTURE_IDS.backgroundLayer,
      }),
    ).toThrow();
  });
});
