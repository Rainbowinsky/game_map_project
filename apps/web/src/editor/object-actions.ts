import { toChunkCoordinate, type MapObject } from '@fantasy-map/map-model';

import { useEditorStore } from '../stores/editor-store.js';
import { useMapStore } from '../stores/map-store.js';
import {
  CreateObjectCommand,
  DeleteObjectCommand,
  UpdateObjectCommand,
} from './commands/commands.js';
import type { CommandManager } from './commands/CommandManager.js';

export function selectedObjects(): MapObject[] {
  const map = useMapStore.getState();
  return useEditorStore
    .getState()
    .selection.map((objectId) => map.objectsById[objectId])
    .filter((object): object is MapObject => Boolean(object));
}

export function deleteSelectedObjects(commandManager: CommandManager): boolean {
  const objects = selectedObjects();
  if (objects.length === 0) return false;
  const transaction = commandManager.beginTransaction(
    objects.length === 1 ? 'Delete object' : `Delete ${objects.length} objects`,
  );
  for (const object of objects) transaction.add(new DeleteObjectCommand(object.id));
  const committed = transaction.commit();
  if (committed) useEditorStore.getState().setSelection([]);
  return committed;
}

export function duplicateObjects(
  commandManager: CommandManager,
  source: readonly MapObject[] = selectedObjects(),
  offset = 240,
): string[] {
  if (source.length === 0) return [];
  const document = useMapStore.getState().document;
  if (!document) return [];
  const transaction = commandManager.beginTransaction(
    source.length === 1 ? 'Duplicate object' : `Duplicate ${source.length} objects`,
  );
  const now = new Date().toISOString();
  const ids: string[] = [];
  for (const object of source) {
    const x = Math.min(document.width, Math.max(0, object.x + offset));
    const y = Math.min(document.height, Math.max(0, object.y + offset));
    const copy: MapObject = {
      ...object,
      id: crypto.randomUUID(),
      x,
      y,
      chunk: toChunkCoordinate({ x, y }, document.settings.chunkSize),
      name: object.name ? `${object.name} 副本` : null,
      zIndex: object.zIndex + 1,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    ids.push(copy.id);
    transaction.add(new CreateObjectCommand(copy));
  }
  if (!transaction.commit()) return [];
  useEditorStore.getState().setSelection(ids);
  return ids;
}

export function moveSelectionInStack(
  commandManager: CommandManager,
  direction: 'forward' | 'backward',
): boolean {
  const objects = selectedObjects();
  if (objects.length === 0) return false;
  const allObjects = Object.values(useMapStore.getState().objectsById);
  const selectedIds = new Set(objects.map((object) => object.id));
  const transaction = commandManager.beginTransaction(
    direction === 'forward' ? 'Bring objects forward' : 'Send objects backward',
  );
  let commandCount = 0;
  for (const layerId of new Set(objects.map((object) => object.layerId))) {
    const siblings = allObjects
      .filter((candidate) => candidate.layerId === layerId)
      .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
    const zIndexes = siblings.map((object) => object.zIndex);
    if (direction === 'forward') {
      for (let index = siblings.length - 2; index >= 0; index -= 1) {
        if (selectedIds.has(siblings[index]!.id) && !selectedIds.has(siblings[index + 1]!.id)) {
          [siblings[index], siblings[index + 1]] = [siblings[index + 1]!, siblings[index]!];
        }
      }
    } else {
      for (let index = 1; index < siblings.length; index += 1) {
        if (selectedIds.has(siblings[index]!.id) && !selectedIds.has(siblings[index - 1]!.id)) {
          [siblings[index], siblings[index - 1]] = [siblings[index - 1]!, siblings[index]!];
        }
      }
    }
    siblings.forEach((object, index) => {
      const zIndex = zIndexes[index]!;
      if (object.zIndex === zIndex) return;
      transaction.add(new UpdateObjectCommand(object.id, { zIndex }, undefined, 'Reorder object'));
      commandCount += 1;
    });
  }
  if (commandCount === 0) {
    transaction.cancel();
    return false;
  }
  return transaction.commit();
}
