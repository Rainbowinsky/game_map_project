import type { CommandContext } from './domain-patch.js';
import { useMapStore } from '../../stores/map-store.js';

/** Adapts the normalized Zustand document store to the command-core contract. */
export function createMapCommandContext(): CommandContext {
  return {
    getDocument: () => {
      const document = useMapStore.getState().document;
      if (!document) throw new Error('No map document is loaded.');
      return document;
    },
    getLayer: (layerId) => useMapStore.getState().layersById[layerId],
    getObject: (objectId) => useMapStore.getState().objectsById[objectId],
    getLocation: (locationId) => useMapStore.getState().locationsById[locationId],
    getObjectsInLayer: (layerId) =>
      Object.values(useMapStore.getState().objectsById).filter(
        (object) => object.layerId === layerId,
      ),
    applyPatches: (patches) => useMapStore.getState().applyPatches(patches),
  };
}
