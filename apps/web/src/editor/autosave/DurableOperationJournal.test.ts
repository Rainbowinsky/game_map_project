import { describe, expect, it } from 'vitest';
import { createApplyOperationsRequestFixture, FIXTURE_IDS } from '@fantasy-map/map-model/fixtures';

import { DurableOperationJournal } from './DurableOperationJournal.js';
import { MemoryRecoveryPersistence, loadRecovery } from './recovery-store.js';

function createJournal(persistence = new MemoryRecoveryPersistence()) {
  return {
    persistence,
    journal: new DurableOperationJournal(persistence, {
      ownerId: FIXTURE_IDS.project,
      mapId: FIXTURE_IDS.map,
      baseRevision: 3,
    }),
  };
}

class FailFirstWritePersistence extends MemoryRecoveryPersistence {
  private attempts = 0;

  override async put(record: Parameters<MemoryRecoveryPersistence['put']>[0]): Promise<void> {
    this.attempts += 1;
    if (this.attempts === 1) throw new Error('IndexedDB quota exceeded.');
    await super.put(record);
  }
}

describe('DurableOperationJournal', () => {
  it('merges safe consecutive updates before creating a save batch', async () => {
    const { journal } = createJournal();
    journal.append({
      source: 'execute',
      operations: [{ type: 'object.update', objectId: FIXTURE_IDS.object, changes: { x: 10 } }],
    });
    journal.append({
      source: 'execute',
      operations: [{ type: 'object.update', objectId: FIXTURE_IDS.object, changes: { y: 20 } }],
    });

    expect(journal.getSnapshot()).toMatchObject({ pendingEntries: 1, pendingOperations: 1 });
    const batch = await journal.beginBatch();
    expect(batch?.operations).toEqual([
      { type: 'object.update', objectId: FIXTURE_IDS.object, changes: { x: 10, y: 20 } },
    ]);
  });

  it('persists the active mutation and only clears the acknowledged prefix', async () => {
    const { journal, persistence } = createJournal();
    const operation = createApplyOperationsRequestFixture().operations[0]!;
    journal.append({ source: 'execute', operations: [operation] });
    const batch = await journal.beginBatch();
    if (!batch) throw new Error('Expected a save batch.');

    journal.append({
      source: 'execute',
      operations: [
        { type: 'object.update', objectId: FIXTURE_IDS.object, changes: { rotation: 1 } },
      ],
    });
    await journal.persisted();
    const duringSave = await loadRecovery(persistence, FIXTURE_IDS.project, FIXTURE_IDS.map);
    expect(duringSave.kind).toBe('valid');
    if (duringSave.kind === 'valid') {
      expect(duringSave.record.activeBatch?.mutationId).toBe(batch.mutationId);
      expect(duringSave.record.entries).toHaveLength(2);
    }

    await journal.acknowledge(batch.throughSequence, 4);
    expect(journal.getSnapshot()).toMatchObject({ baseRevision: 4, pendingEntries: 1 });
    const next = await journal.beginBatch();
    expect(next).toMatchObject({ baseRevision: 4 });
    expect(next?.mutationId).not.toBe(batch.mutationId);
  });

  it('isolates recovery records by owner, map and schema', async () => {
    const { journal, persistence } = createJournal();
    journal.append({
      source: 'execute',
      operations: [createApplyOperationsRequestFixture().operations[0]!],
    });
    await journal.persisted();

    expect((await loadRecovery(persistence, FIXTURE_IDS.project, FIXTURE_IDS.map)).kind).toBe(
      'valid',
    );
    expect(
      (await loadRecovery(persistence, '10000000-0000-4000-8000-000000000099', FIXTURE_IDS.map))
        .kind,
    ).toBe('none');
  });

  it('reports a recovery-storage failure and repairs it before sending a batch', async () => {
    const persistence = new FailFirstWritePersistence();
    const { journal } = createJournal(persistence);
    journal.append({
      source: 'execute',
      operations: [createApplyOperationsRequestFixture().operations[0]!],
    });

    await expect(journal.persisted()).rejects.toThrow('IndexedDB quota exceeded.');
    expect(journal.getSnapshot().persistenceError).toBe('IndexedDB quota exceeded.');

    const batch = await journal.beginBatch();
    expect(batch?.operations).toHaveLength(1);
    expect(journal.getSnapshot().persistenceError).toBeNull();
    expect((await loadRecovery(persistence, FIXTURE_IDS.project, FIXTURE_IDS.map)).kind).toBe(
      'valid',
    );
  });
});
