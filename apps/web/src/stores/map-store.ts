import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  chunkKey,
  mapLayerSchema,
  mapObjectSchema,
  mapChunkPayloadSchema,
  mapDocumentSchema,
  type MapChunkPayload,
  type MapDocument,
  type MapLayer,
  type MapObject,
} from '@fantasy-map/map-model';

import type { DomainPatch } from '../editor/commands/domain-patch.js';

export interface MapState {
  document: MapDocument | null;
  layersById: Record<string, MapLayer>;
  objectsById: Record<string, MapObject>;
  chunkObjectIds: Record<string, string[]>;
  hydrate: (document: MapDocument, chunks: MapChunkPayload[]) => void;
  applyPatches: (patches: readonly DomainPatch[]) => void;
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
    applyPatches: (patches) => {
      if (patches.length === 0) return;
      set((state) => {
        if (!state.document) throw new Error('Cannot apply command patches without a loaded map.');

        for (const patch of patches) {
          switch (patch.type) {
            case 'object.create': {
              const object = mapObjectSchema.parse(patch.object);
              if (state.objectsById[object.id])
                throw new Error(`Object ${object.id} already exists.`);
              if (object.mapId !== state.document.id)
                throw new Error('Object belongs to another map.');
              if (!state.layersById[object.layerId])
                throw new Error(`Layer ${object.layerId} does not exist.`);
              state.objectsById[object.id] = object;
              break;
            }
            case 'object.replace': {
              const object = mapObjectSchema.parse(patch.object);
              if (!state.objectsById[object.id])
                throw new Error(`Object ${object.id} does not exist.`);
              if (object.mapId !== state.document.id)
                throw new Error('Object belongs to another map.');
              if (!state.layersById[object.layerId])
                throw new Error(`Layer ${object.layerId} does not exist.`);
              state.objectsById[object.id] = object;
              break;
            }
            case 'object.delete': {
              if (!state.objectsById[patch.objectId]) {
                throw new Error(`Object ${patch.objectId} does not exist.`);
              }
              delete state.objectsById[patch.objectId];
              break;
            }
            case 'layer.create': {
              const layer = mapLayerSchema.parse(patch.layer);
              if (state.layersById[layer.id]) throw new Error(`Layer ${layer.id} already exists.`);
              if (layer.mapId !== state.document.id)
                throw new Error('Layer belongs to another map.');
              state.layersById[layer.id] = layer;
              break;
            }
            case 'layer.replace': {
              const layer = mapLayerSchema.parse(patch.layer);
              if (!state.layersById[layer.id]) throw new Error(`Layer ${layer.id} does not exist.`);
              if (layer.mapId !== state.document.id)
                throw new Error('Layer belongs to another map.');
              state.layersById[layer.id] = layer;
              break;
            }
            case 'layer.delete': {
              if (!state.layersById[patch.layerId])
                throw new Error(`Layer ${patch.layerId} does not exist.`);
              if (
                Object.values(state.objectsById).some((object) => object.layerId === patch.layerId)
              ) {
                throw new Error(`Layer ${patch.layerId} still contains objects.`);
              }
              delete state.layersById[patch.layerId];
              break;
            }
            case 'layer.reorder': {
              const siblings = Object.values(state.layersById).filter(
                (layer) => layer.parentId === patch.parentId,
              );
              if (
                siblings.length !== patch.orderedLayerIds.length ||
                siblings.some((layer) => !patch.orderedLayerIds.includes(layer.id))
              ) {
                throw new Error('Layer reorder must contain every sibling exactly once.');
              }
              patch.orderedLayerIds.forEach((layerId, order) => {
                const layer = state.layersById[layerId];
                if (layer) layer.order = order;
              });
              break;
            }
            case 'document.replace': {
              const document = mapDocumentSchema.parse(patch.document);
              if (document.id !== state.document.id)
                throw new Error('Cannot replace another map document.');
              state.document = document;
              break;
            }
          }
        }

        const layers = Object.values(state.layersById);
        const document = mapDocumentSchema.parse({ ...state.document, layers });
        state.document = document;
        state.layersById = Object.fromEntries(document.layers.map((layer) => [layer.id, layer]));
        state.chunkObjectIds = {};
        for (const object of Object.values(state.objectsById)) {
          const key = chunkKey(object.chunk);
          const memberIds = state.chunkObjectIds[key] ?? [];
          memberIds.push(object.id);
          state.chunkObjectIds[key] = memberIds;
        }
      });
    },
    clear: () => set(emptyState()),
  })),
);
