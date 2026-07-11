import { describe, expect, it } from 'vitest';
import {
  createMapChunkPayloadFixture,
  createMapDocumentFixture,
} from '@fantasy-map/map-model/fixtures';
import type { MapDocument } from '@fantasy-map/map-model';

import { useMapStore } from './stores/map-store.js';

describe('normalized map store', () => {
  it('validates and normalizes documents, layers, objects and chunk membership', () => {
    const document = createMapDocumentFixture();
    const chunk = createMapChunkPayloadFixture();
    useMapStore.getState().hydrate(document, [chunk]);

    const state = useMapStore.getState();
    expect(state.document?.id).toBe(document.id);
    expect(Object.keys(state.layersById)).toEqual(document.layers.map((layer) => layer.id));
    expect(state.objectsById[chunk.objects[0]?.id ?? '']).toEqual(chunk.objects[0]);
    expect(state.chunkObjectIds['1:-1']).toEqual([chunk.objects[0]?.id]);
  });

  it('rejects invalid server data before it enters the store', () => {
    const invalidDocument = {
      ...createMapDocumentFixture(),
      schemaVersion: 99,
    } as unknown as MapDocument;
    expect(() => useMapStore.getState().hydrate(invalidDocument, [])).toThrow();
  });
});
