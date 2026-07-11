import type { ApplyOperationsResponse, MapOperation } from '@fantasy-map/map-model';

import type { DurableOperationJournal } from './DurableOperationJournal.js';

export type AutosaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'conflict';

export interface AutosaveSnapshot {
  readonly status: AutosaveStatus;
  readonly revision: number;
  readonly pendingOperations: number;
  readonly errorMessage: string | null;
}

export interface AutosaveScheduler {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveOptions {
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
  readonly retryBaseMs?: number;
  readonly retryMaxMs?: number;
  readonly scheduler?: AutosaveScheduler;
  readonly isOnline?: () => boolean;
  readonly save: (input: {
    readonly baseRevision: number;
    readonly clientMutationId: string;
    readonly operations: readonly MapOperation[];
  }) => Promise<ApplyOperationsResponse>;
  readonly onRevision?: (revision: number, updatedAt: string) => void;
}

type AutosaveListener = (snapshot: AutosaveSnapshot) => void;

const browserScheduler: AutosaveScheduler = {
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

function errorStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '自动保存失败，将自动重试。';
}

export class AutosaveCoordinator {
  private readonly listeners = new Set<AutosaveListener>();
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly scheduler: AutosaveScheduler;
  private readonly isOnline: () => boolean;
  private debounceTimer: unknown | null = null;
  private maxWaitTimer: unknown | null = null;
  private retryTimer: unknown | null = null;
  private retryAttempt = 0;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  private unsubscribeJournal: (() => void) | null = null;
  private snapshot: AutosaveSnapshot;

  constructor(
    private readonly journal: DurableOperationJournal,
    private readonly options: AutosaveOptions,
  ) {
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 5_000;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.retryMaxMs = options.retryMaxMs ?? 30_000;
    this.scheduler = options.scheduler ?? browserScheduler;
    this.isOnline = options.isOnline ?? (() => navigator.onLine);
    const journalSnapshot = journal.getSnapshot();
    this.snapshot = {
      status: journalSnapshot.pendingOperations > 0 ? 'dirty' : 'saved',
      revision: journalSnapshot.baseRevision,
      pendingOperations: journalSnapshot.pendingOperations,
      errorMessage: null,
    };
  }

  start(): void {
    if (this.unsubscribeJournal || this.stopped) return;
    this.unsubscribeJournal = this.journal.subscribe(() => this.handleJournalChange());
    if (this.journal.getSnapshot().pendingOperations > 0) this.scheduleSave();
  }

  subscribe(listener: AutosaveListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AutosaveSnapshot {
    return this.snapshot;
  }

  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performSave().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  retryNow(): void {
    if (this.snapshot.status === 'conflict' || this.stopped) return;
    this.clearRetry();
    void this.flush();
  }

  setOnline(online: boolean): void {
    if (!online && this.journal.getSnapshot().pendingOperations > 0) {
      this.setSnapshot('offline', '网络已断开，更改已安全保存在本机。');
      return;
    }
    if (online && ['offline', 'error'].includes(this.snapshot.status)) this.retryNow();
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribeJournal?.();
    this.unsubscribeJournal = null;
    this.clearSaveTimers();
    this.clearRetry();
  }

  private handleJournalChange(): void {
    const pending = this.journal.getSnapshot().pendingOperations;
    if (pending === 0) {
      if (!this.inFlight) this.setSnapshot('saved', null);
      return;
    }
    if (!this.inFlight && this.snapshot.status !== 'conflict') this.setSnapshot('dirty', null);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.stopped || this.snapshot.status === 'conflict') return;
    if (this.debounceTimer !== null) this.scheduler.clearTimeout(this.debounceTimer);
    this.debounceTimer = this.scheduler.setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, this.debounceMs);
    if (this.maxWaitTimer === null) {
      this.maxWaitTimer = this.scheduler.setTimeout(() => {
        this.maxWaitTimer = null;
        void this.flush();
      }, this.maxWaitMs);
    }
  }

  private async performSave(): Promise<void> {
    if (this.stopped || this.snapshot.status === 'conflict') return;
    this.clearSaveTimers();
    const pending = this.journal.getSnapshot().pendingOperations;
    if (pending === 0) {
      this.setSnapshot('saved', null);
      return;
    }
    if (!this.isOnline()) {
      this.setSnapshot('offline', '网络已断开，更改已安全保存在本机。');
      this.scheduleRetry();
      return;
    }
    try {
      const batch = await this.journal.beginBatch();
      if (!batch) return;
      this.setSnapshot('saving', null);
      const response = await this.options.save({
        baseRevision: batch.baseRevision,
        clientMutationId: batch.mutationId,
        operations: batch.operations,
      });
      await this.journal.acknowledge(batch.throughSequence, response.revision);
      this.retryAttempt = 0;
      this.options.onRevision?.(response.revision, response.updatedAt);
      if (this.journal.getSnapshot().pendingOperations > 0) {
        this.setSnapshot('dirty', null);
        this.scheduleSave();
      } else {
        this.setSnapshot('saved', null);
      }
    } catch (error) {
      if (errorStatus(error) === 409 || errorCode(error) === 'REVISION_CONFLICT') {
        this.setSnapshot('conflict', '地图已在其他位置更新，请重新加载后处理冲突。');
        return;
      }
      const offline = errorStatus(error) === 0 || errorCode(error) === 'NETWORK_ERROR';
      this.setSnapshot(offline ? 'offline' : 'error', errorMessage(error));
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.snapshot.status === 'conflict' || this.retryTimer !== null) return;
    const delay = Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** this.retryAttempt);
    this.retryAttempt += 1;
    this.retryTimer = this.scheduler.setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private setSnapshot(status: AutosaveStatus, error: string | null): void {
    const journal = this.journal.getSnapshot();
    this.snapshot = {
      status,
      revision: journal.baseRevision,
      pendingOperations: journal.pendingOperations,
      errorMessage: error,
    };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private clearSaveTimers(): void {
    if (this.debounceTimer !== null) this.scheduler.clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer !== null) this.scheduler.clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.scheduler.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
