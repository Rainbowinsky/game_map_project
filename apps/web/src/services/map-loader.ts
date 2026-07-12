import { api } from './api-client.js';
import { useMapStore } from '../stores/map-store.js';

async function loadInBatches<T, R>(
  items: readonly T[],
  load: (item: T) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...(await Promise.all(items.slice(index, index + concurrency).map(load))));
  }
  return results;
}

export async function loadMapIntoStore(accessToken: string, mapId: string) {
  const [document, chunkList, locationList] = await Promise.all([
    api.getMap(accessToken, mapId),
    api.listChunks(accessToken, mapId),
    api.listLocations(accessToken, mapId),
  ]);
  const chunks = await loadInBatches(chunkList.items, (chunk) =>
    api.getChunk(accessToken, mapId, chunk.coordinate),
  );
  useMapStore.getState().hydrate(document, chunks, locationList.items);
  return { mapId: document.id, revision: document.revision, chunkCount: chunks.length };
}
