import {
  MAP_MODEL_SCHEMA_VERSION,
  mapOperationSchema,
  type MapOperation,
} from '@fantasy-map/map-model';

import type { OperationJournal } from '../commands/operation-journal.js';
import type { PatchEvent } from '../commands/patch-bus.js';
import {
  persistedJournalSchema,
  recoveryKey,
  type PersistedJournal,
  type PersistedJournalEntry,
  type PersistedSaveBatch,
  type RecoveryPersistence,
} from './recovery-store.js';

export interface JournalIdentity {
  readonly ownerId: string;
  readonly mapId: string;
  readonly baseRevision: number;
}

export interface JournalSnapshot {
  readonly baseRevision: number;
  readonly pendingEntries: number;
  readonly pendingOperations: number;
}

type JournalListener = (snapshot: JournalSnapshot) => void;

function mergeOperations(
  previous: readonly MapOperation[],
  next: readonly MapOperation[],
): MapOperation[] | null {
  if (previous.length !== 1 || next.length !== 1) return null;
  const left = previous[0]!;
  const right = next[0]!;
  if (
    left.type === 'object.update' &&
    right.type === 'object.update' &&
    left.objectId === right.objectId
  ) {
    return [{ ...right, changes: { ...left.changes, ...right.changes } }];
  }
  if (
    left.type === 'layer.update' &&
    right.type === 'layer.update' &&
    left.layerId === right.layerId
  ) {
    return [{ ...right, changes: { ...left.changes, ...right.changes } }];
  }
  if (left.type === 'map.update' && right.type === 'map.update') {
    return [{ ...right, changes: { ...left.changes, ...right.changes } }];
  }
  return null;
}

export class DurableOperationJournal implements OperationJournal {
  private record: PersistedJournal;
  private readonly listeners = new Set<JournalListener>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: RecoveryPersistence,
    identity: JournalIdentity,
    recovered?: PersistedJournal,
  ) {
    this.record = recovered
      ? persistedJournalSchema.parse(recovered)
      : {
          key: recoveryKey(identity.ownerId, identity.mapId),
          ownerId: identity.ownerId,
          mapId: identity.mapId,
          schemaVersion: MAP_MODEL_SCHEMA_VERSION,
          baseRevision: identity.baseRevision,
          nextSequence: 1,
          entries: [],
          activeBatch: null,
          updatedAt: Date.now(),
        };
  }

  append(entry: {
    readonly source: PatchEvent['source'];
    readonly operations: readonly MapOperation[];
  }): void {
    const operations = entry.operations.map((operation) => mapOperationSchema.parse(operation));
    if (operations.length === 0) return;
    const entries = [...this.record.entries];
    const last = entries.at(-1);
    const protectedThrough = this.record.activeBatch?.throughSequence ?? 0;
    const merged =
      last && last.sequence > protectedThrough
        ? mergeOperations(last.operations, operations)
        : null;
    if (last && merged) {
      entries[entries.length - 1] = { ...last, source: entry.source, operations: merged };
    } else {
      entries.push({
        sequence: this.record.nextSequence,
        source: entry.source,
        operations,
        createdAt: Date.now(),
      });
      this.record = { ...this.record, nextSequence: this.record.nextSequence + 1 };
    }
    this.record = { ...this.record, entries, updatedAt: Date.now() };
    this.queueWrite();
    this.notify();
  }

  subscribe(listener: JournalListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): JournalSnapshot {
    return {
      baseRevision: this.record.baseRevision,
      pendingEntries: this.record.entries.length,
      pendingOperations: this.record.entries.reduce(
        (total, entry) => total + entry.operations.length,
        0,
      ),
    };
  }

  getPersistedRecord(): PersistedJournal {
    return structuredClone(this.record);
  }

  async beginBatch(maxOperations = 500): Promise<PersistedSaveBatch | null> {
    if (this.record.activeBatch) return structuredClone(this.record.activeBatch);
    if (this.record.entries.length === 0) return null;
    const selected: PersistedJournalEntry[] = [];
    let operationCount = 0;
    for (const entry of this.record.entries) {
      if (operationCount + entry.operations.length > maxOperations) break;
      selected.push(entry);
      operationCount += entry.operations.length;
    }
    if (selected.length === 0) throw new Error('A journal entry exceeds the save batch limit.');
    const batch: PersistedSaveBatch = {
      mutationId: crypto.randomUUID(),
      baseRevision: this.record.baseRevision,
      throughSequence: selected.at(-1)!.sequence,
      operations: selected.flatMap((entry) => entry.operations),
    };
    this.record = { ...this.record, activeBatch: batch, updatedAt: Date.now() };
    this.queueWrite();
    await this.persisted();
    return structuredClone(batch);
  }

  async acknowledge(throughSequence: number, revision: number): Promise<void> {
    const active = this.record.activeBatch;
    if (!active || active.throughSequence !== throughSequence) {
      throw new Error('The acknowledged batch does not match the active journal batch.');
    }
    this.record = {
      ...this.record,
      baseRevision: revision,
      entries: this.record.entries.filter((entry) => entry.sequence > throughSequence),
      activeBatch: null,
      updatedAt: Date.now(),
    };
    if (this.record.entries.length === 0) {
      this.writeChain = this.writeChain.then(() => this.persistence.delete(this.record.key));
    } else {
      this.queueWrite();
    }
    await this.persisted();
    this.notify();
  }

  async discard(): Promise<void> {
    this.record = { ...this.record, entries: [], activeBatch: null, updatedAt: Date.now() };
    this.writeChain = this.writeChain.then(() => this.persistence.delete(this.record.key));
    await this.persisted();
    this.notify();
  }

  persisted(): Promise<void> {
    return this.writeChain;
  }

  private queueWrite(): void {
    const snapshot = structuredClone(this.record);
    this.writeChain = this.writeChain.then(() => this.persistence.put(snapshot));
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
