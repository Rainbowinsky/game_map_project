import { z } from 'zod';
import {
  MAP_MODEL_SCHEMA_VERSION,
  mapOperationSchema,
  type MapOperation,
} from '@fantasy-map/map-model';

const DB_NAME = 'atlas-editor-recovery';
const DB_VERSION = 1;
const STORE_NAME = 'journals';
const OWNER_INDEX = 'ownerId';

export const persistedJournalEntrySchema = z
  .object({
    sequence: z.number().int().safe().positive(),
    source: z.enum(['execute', 'undo', 'redo']),
    operations: z.array(mapOperationSchema).min(1).max(500),
    createdAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export const persistedSaveBatchSchema = z
  .object({
    mutationId: z.string().uuid(),
    baseRevision: z.number().int().safe().nonnegative(),
    throughSequence: z.number().int().safe().positive(),
    operations: z.array(mapOperationSchema).min(1).max(500),
  })
  .strict();

export const persistedJournalSchema = z
  .object({
    key: z.string().min(1).max(200),
    ownerId: z.string().uuid(),
    mapId: z.string().uuid(),
    schemaVersion: z.number().int().safe().positive(),
    baseRevision: z.number().int().safe().nonnegative(),
    nextSequence: z.number().int().safe().positive(),
    entries: z.array(persistedJournalEntrySchema).max(20_000),
    activeBatch: persistedSaveBatchSchema.nullable(),
    updatedAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export type PersistedJournalEntry = z.infer<typeof persistedJournalEntrySchema>;
export type PersistedSaveBatch = z.infer<typeof persistedSaveBatchSchema>;
export type PersistedJournal = z.infer<typeof persistedJournalSchema>;

export interface RecoveryPersistence {
  get(key: string): Promise<unknown | null>;
  put(record: PersistedJournal): Promise<void>;
  delete(key: string): Promise<void>;
  deleteOwner(ownerId: string): Promise<void>;
}

export type RecoveryLoadResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'valid'; readonly record: PersistedJournal }
  | { readonly kind: 'invalid'; readonly reason: string };

export function recoveryKey(ownerId: string, mapId: string): string {
  return `${ownerId}:${mapId}`;
}

export async function loadRecovery(
  persistence: RecoveryPersistence,
  ownerId: string,
  mapId: string,
): Promise<RecoveryLoadResult> {
  const value = await persistence.get(recoveryKey(ownerId, mapId));
  if (value === null) return { kind: 'none' };
  const parsed = persistedJournalSchema.safeParse(value);
  if (!parsed.success) return { kind: 'invalid', reason: '恢复日志格式无效，无法安全读取。' };
  if (parsed.data.ownerId !== ownerId || parsed.data.mapId !== mapId) {
    return { kind: 'invalid', reason: '恢复日志不属于当前用户或地图。' };
  }
  if (parsed.data.schemaVersion !== MAP_MODEL_SCHEMA_VERSION) {
    return { kind: 'invalid', reason: '恢复日志来自不兼容的数据版本。' };
  }
  return parsed.data.entries.length === 0
    ? { kind: 'none' }
    : { kind: 'valid', record: parsed.data };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted.'));
  });
}

export class IndexedDbRecoveryPersistence implements RecoveryPersistence {
  private database: Promise<IDBDatabase> | null = null;

  async get(key: string): Promise<unknown | null> {
    if (typeof indexedDB === 'undefined') return null;
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const value = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    await transactionDone(transaction);
    return value ?? null;
  }

  async put(record: PersistedJournal): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  }

  async delete(key: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  }

  async deleteOwner(ownerId: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const index = transaction.objectStore(STORE_NAME).index(OWNER_INDEX);
    const keys = await requestResult(index.getAllKeys(IDBKeyRange.only(ownerId)));
    const store = transaction.objectStore(STORE_NAME);
    for (const key of keys) store.delete(key);
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(STORE_NAME)
          ? request.transaction!.objectStore(STORE_NAME)
          : database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        if (!store.indexNames.contains(OWNER_INDEX)) {
          store.createIndex(OWNER_INDEX, OWNER_INDEX, { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'));
    });
    return this.database;
  }
}

export class MemoryRecoveryPersistence implements RecoveryPersistence {
  readonly records = new Map<string, PersistedJournal>();

  async get(key: string): Promise<unknown | null> {
    return structuredClone(this.records.get(key) ?? null);
  }

  async put(record: PersistedJournal): Promise<void> {
    this.records.set(record.key, structuredClone(record));
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async deleteOwner(ownerId: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.ownerId === ownerId) this.records.delete(key);
    }
  }
}

export function flattenPersistedOperations(record: PersistedJournal): MapOperation[] {
  return record.entries.flatMap((entry) => entry.operations);
}
