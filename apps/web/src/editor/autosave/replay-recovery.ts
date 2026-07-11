import {
  toChunkCoordinate,
  type MapLayer,
  type MapObject,
  type MapOperation,
} from '@fantasy-map/map-model';

import type { CommandManager } from '../commands/CommandManager.js';
import {
  CreateLayerCommand,
  CreateObjectCommand,
  DeleteLayerCommand,
  DeleteObjectCommand,
  ReorderLayersCommand,
  UpdateLayerCommand,
  UpdateMapMetadataCommand,
  UpdateObjectCommand,
} from '../commands/commands.js';
import type { EditorCommand } from '../commands/domain-patch.js';
import { useMapStore } from '../../stores/map-store.js';

function commandForOperation(operation: MapOperation, timestamp: string): EditorCommand {
  const document = useMapStore.getState().document;
  if (!document) throw new Error('Cannot replay recovery operations without a loaded map.');
  switch (operation.type) {
    case 'object.create': {
      const object: MapObject = {
        ...operation.object,
        mapId: document.id,
        chunk: toChunkCoordinate(
          { x: operation.object.x, y: operation.object.y },
          document.settings.chunkSize,
        ),
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return new CreateObjectCommand(object);
    }
    case 'object.update':
      return new UpdateObjectCommand(operation.objectId, operation.changes);
    case 'object.delete':
      return new DeleteObjectCommand(operation.objectId);
    case 'object.reorder':
      throw new Error('Object reorder recovery is not supported by this editor version.');
    case 'layer.create': {
      const layer: MapLayer = {
        ...operation.layer,
        mapId: document.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return new CreateLayerCommand(layer);
    }
    case 'layer.update':
      return new UpdateLayerCommand(operation.layerId, operation.changes);
    case 'layer.delete':
      return new DeleteLayerCommand(
        operation.layerId,
        operation.objectPolicy,
        operation.targetLayerId,
      );
    case 'layer.reorder':
      return new ReorderLayersCommand(operation.parentId, operation.orderedLayerIds);
    case 'map.update':
      return new UpdateMapMetadataCommand(operation);
  }
}

/** Atomically replays validated persisted operations without re-journalling them. */
export function replayRecoveryOperations(
  commandManager: CommandManager,
  operations: readonly MapOperation[],
): boolean {
  if (operations.length === 0) return false;
  const timestamp = new Date().toISOString();
  const transaction = commandManager.beginTransaction('Recover unsaved edits');
  for (const operation of operations) transaction.add(commandForOperation(operation, timestamp));
  const committed = transaction.commit();
  commandManager.clear();
  return committed;
}
