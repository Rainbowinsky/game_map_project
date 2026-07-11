import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  mapChunkPayloadSchema,
  mapDocumentSchema,
  type MapChunkPayload,
  type MapDocument,
  type MapLayer,
  type MapObject,
} from '@fantasy-map/map-model';

interface MapState {
  document: MapDocument | null;
  layersById: Record<string, MapLayer>;
  objectsById: Record<string, MapObject>;
  chunkObjectIds: Record<string, string[]>;
  hydrate: (document: MapDocument, chunks: MapChunkPayload[]) => void;
  clear: () => void;
}

const emptyState = () => ({
  document: null,
  layersById: {},
  objectsById: {},
  chunkObjectIds: {},
});

export const useMapStore: UseBoundStore<StoreApi<MapState>> = create<MapState>()(
  immer((set) => ({
    ...emptyState(),
    hydrate: (documentInput, chunkInputs) => {
      const document = mapDocumentSchema.parse(documentInput);
      const chunks = chunkInputs.map((chunk) => mapChunkPayloadSchema.parse(chunk));
      set((state) => {
        state.document = document;
        state.layersById = Object.fromEntries(document.layers.map((layer) => [layer.id, layer]));
        state.objectsById = {};
        state.chunkObjectIds = {};
        for (const chunk of chunks) {
          const key = `${chunk.coordinate.x}:${chunk.coordinate.y}`;
          state.chunkObjectIds[key] = chunk.objects.map((object) => object.id);
          for (const object of chunk.objects) state.objectsById[object.id] = object;
        }
      });
    },
    clear: () => set(emptyState()),
  })),
);
