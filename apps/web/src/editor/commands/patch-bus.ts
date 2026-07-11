import type { MapOperation } from '@fantasy-map/map-model';

import type { DomainPatch } from './domain-patch.js';

export type PatchSource = 'execute' | 'undo' | 'redo';

export interface PatchEvent {
  readonly source: PatchSource;
  readonly patches: readonly DomainPatch[];
  readonly operations: readonly MapOperation[];
}

export type PatchListener = (event: PatchEvent) => void;

/**
 * Fan-out point for projection, journalling and other consumers. Listener
 * failures are isolated so a renderer or journal observer cannot corrupt
 * command history after the domain store has committed a patch batch.
 */
export class PatchBus {
  private readonly listeners = new Set<PatchListener>();

  subscribe(listener: PatchListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(source: PatchSource, patches: readonly DomainPatch[]): void {
    if (patches.length === 0) return;

    const event: PatchEvent = {
      source,
      patches,
      operations: patches.flatMap((patch) => (patch.operation === null ? [] : [patch.operation])),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        // Observers must not make the committed document or history half-applied.
        console.error('A command patch listener failed.', error);
      }
    }
  }
}
