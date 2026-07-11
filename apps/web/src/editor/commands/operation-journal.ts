import type { MapOperation } from '@fantasy-map/map-model';

import type { PatchBus, PatchEvent } from './patch-bus.js';

/** Persistence boundary implemented by DurableOperationJournal. */
export interface OperationJournal {
  append(entry: {
    readonly source: PatchEvent['source'];
    readonly operations: readonly MapOperation[];
  }): void;
}

/** Connects only persistable operations; renderer-only patches never enter the journal. */
export function connectOperationJournal(patchBus: PatchBus, journal: OperationJournal): () => void {
  return patchBus.subscribe(({ source, operations }) => {
    if (operations.length > 0) journal.append({ source, operations });
  });
}
