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

  it('enforces the 500-operation persistence batch boundary', () => {
    const request = createApplyOperationsRequestFixture();
    const operation = request.operations[0]!;
    expect(
      applyOperationsRequestSchema.parse({
        ...request,
        operations: Array.from({ length: 500 }, () => operation),
      }).operations,
    ).toHaveLength(500);
    expect(() =>
      applyOperationsRequestSchema.parse({
        ...request,
        operations: Array.from({ length: 501 }, () => operation),
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

  it('limits the serialized operation payload', () => {
    expect(() =>
      applyOperationsRequestSchema.parse({
        ...createApplyOperationsRequestFixture(),
        operations: Array.from({ length: 200 }, () => ({
          type: 'object.update' as const,
          objectId: FIXTURE_IDS.object,
          changes: { metadata: { text: 'x'.repeat(12_000) } },
        })),
      }),
    ).toThrow(/Operation batch/);
  });
});
