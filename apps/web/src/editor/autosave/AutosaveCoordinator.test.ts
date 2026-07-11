import { describe, expect, it, vi } from 'vitest';
import { createApplyOperationsRequestFixture, FIXTURE_IDS } from '@fantasy-map/map-model/fixtures';

import { AutosaveCoordinator, type AutosaveScheduler } from './AutosaveCoordinator.js';
import { DurableOperationJournal } from './DurableOperationJournal.js';
import { MemoryRecoveryPersistence } from './recovery-store.js';

class TestScheduler implements AutosaveScheduler {
  readonly tasks = new Map<number, { callback: () => void; delay: number }>();
  private nextId = 1;

  setTimeout(callback: () => void, delay: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { callback, delay });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }
}

function setup() {
  const persistence = new MemoryRecoveryPersistence();
  const journal = new DurableOperationJournal(persistence, {
    ownerId: FIXTURE_IDS.project,
    mapId: FIXTURE_IDS.map,
    baseRevision: 3,
  });
  const operation = createApplyOperationsRequestFixture().operations[0]!;
  return { persistence, journal, operation };
}

function response(revision: number, mutationId: string) {
  return {
    mapId: FIXTURE_IDS.map,
    acceptedMutationId: mutationId,
    previousRevision: revision - 1,
    revision,
    updatedAt: '2026-07-12T00:00:00.000Z',
    changedChunkKeys: [],
  };
}

async function waitForCall(spy: { mock: { calls: unknown[][] } }): Promise<void> {
  for (let index = 0; index < 20 && spy.mock.calls.length === 0; index += 1) {
    await Promise.resolve();
  }
}

describe('AutosaveCoordinator', () => {
  it('uses an 800 ms debounce with a 5 s maximum wait', () => {
    const { journal, operation } = setup();
    const scheduler = new TestScheduler();
    const coordinator = new AutosaveCoordinator(journal, {
      save: vi.fn(),
      scheduler,
      isOnline: () => true,
    });
    coordinator.start();
    journal.append({ source: 'execute', operations: [operation] });
    expect([...scheduler.tasks.values()].map((task) => task.delay).sort((a, b) => a - b)).toEqual([
      800, 5_000,
    ]);

    journal.append({
      source: 'execute',
      operations: [
        { type: 'object.update', objectId: FIXTURE_IDS.object, changes: { rotation: 1 } },
      ],
    });
    expect([...scheduler.tasks.values()].map((task) => task.delay).sort((a, b) => a - b)).toEqual([
      800, 5_000,
    ]);
    coordinator.stop();
  });

  it('remains dirty when another edit arrives during an in-flight save', async () => {
    const { journal, operation } = setup();
    let resolveSave: ((value: ReturnType<typeof response>) => void) | undefined;
    let savedMutationId = '';
    const save = vi.fn(
      (input: { clientMutationId: string }) =>
        new Promise<ReturnType<typeof response>>((resolve) => {
          savedMutationId = input.clientMutationId;
          resolveSave = (value) => resolve(value);
        }),
    );
    const coordinator = new AutosaveCoordinator(journal, {
      save,
      scheduler: new TestScheduler(),
      isOnline: () => true,
    });
    coordinator.start();
    journal.append({ source: 'execute', operations: [operation] });
    const saving = coordinator.flush();
    await waitForCall(save);
    expect(coordinator.getSnapshot().status).toBe('saving');

    journal.append({
      source: 'execute',
      operations: [
        { type: 'object.update', objectId: FIXTURE_IDS.object, changes: { rotation: 1 } },
      ],
    });
    resolveSave?.(response(4, savedMutationId));
    await saving;

    expect(coordinator.getSnapshot()).toMatchObject({ status: 'dirty', pendingOperations: 1 });
    coordinator.stop();
  });

  it('serializes concurrent flush calls', async () => {
    const { journal, operation } = setup();
    let resolveSave: ((value: ReturnType<typeof response>) => void) | undefined;
    let savedMutationId = '';
    const save = vi.fn(
      (input: { clientMutationId: string }) =>
        new Promise<ReturnType<typeof response>>((resolve) => {
          savedMutationId = input.clientMutationId;
          resolveSave = resolve;
        }),
    );
    const coordinator = new AutosaveCoordinator(journal, { save, isOnline: () => true });
    journal.append({ source: 'execute', operations: [operation] });
    const first = coordinator.flush();
    const second = coordinator.flush();
    await waitForCall(save);
    expect(save).toHaveBeenCalledTimes(1);
    resolveSave?.(response(4, savedMutationId));
    await Promise.all([first, second]);
    expect(coordinator.getSnapshot().status).toBe('saved');
  });

  it('retains the journal and reuses the mutation id after a network failure', async () => {
    const { journal, operation } = setup();
    const mutationIds: string[] = [];
    let attempt = 0;
    const save = vi.fn(async (input: { clientMutationId: string }) => {
      mutationIds.push(input.clientMutationId);
      attempt += 1;
      if (attempt === 1)
        throw Object.assign(new Error('offline'), { status: 0, code: 'NETWORK_ERROR' });
      return response(4, input.clientMutationId);
    });
    const scheduler = new TestScheduler();
    const coordinator = new AutosaveCoordinator(journal, {
      save,
      scheduler,
      isOnline: () => true,
    });
    journal.append({ source: 'execute', operations: [operation] });
    await coordinator.flush();
    expect(coordinator.getSnapshot()).toMatchObject({ status: 'offline', pendingOperations: 1 });
    expect([...scheduler.tasks.values()].some((task) => task.delay === 1_000)).toBe(true);

    coordinator.retryNow();
    await coordinator.flush();
    expect(mutationIds[1]).toBe(mutationIds[0]);
    expect(coordinator.getSnapshot()).toMatchObject({ status: 'saved', pendingOperations: 0 });
  });

  it('enters conflict without scheduling a retry for 409', async () => {
    const { journal, operation } = setup();
    const scheduler = new TestScheduler();
    const save = vi.fn(async () => {
      throw Object.assign(new Error('conflict'), { status: 409, code: 'REVISION_CONFLICT' });
    });
    const coordinator = new AutosaveCoordinator(journal, {
      save,
      scheduler,
      isOnline: () => true,
    });
    journal.append({ source: 'execute', operations: [operation] });
    await coordinator.flush();

    expect(coordinator.getSnapshot()).toMatchObject({ status: 'conflict', pendingOperations: 1 });
    expect(scheduler.tasks.size).toBe(0);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
