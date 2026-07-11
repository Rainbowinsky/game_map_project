import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMapChunkPayloadFixture,
  createMapDocumentFixture,
  createStampMapObjectFixture,
} from '@fantasy-map/map-model/fixtures';
import type { MapObject } from '@fantasy-map/map-model';

import { useMapStore } from '../../stores/map-store.js';
import { CommandManager } from './CommandManager.js';
import {
  CreateLayerCommand,
  DeleteLayerCommand,
  TransformObjectsCommand,
  UpdateObjectCommand,
} from './commands.js';
import type { EditorCommand } from './domain-patch.js';
import { createMapCommandContext } from './map-command-context.js';

const object = () => createStampMapObjectFixture();

function loadedManager(options?: ConstructorParameters<typeof CommandManager>[1]) {
  const document = createMapDocumentFixture();
  const chunk = createMapChunkPayloadFixture();
  useMapStore.getState().hydrate(document, [chunk]);
  return new CommandManager(createMapCommandContext(), options);
}

function currentObject(): MapObject {
  const value = useMapStore.getState().objectsById[object().id];
  if (!value) throw new Error('Expected fixture object to be loaded.');
  return value;
}

function rootLayerIds(): string[] {
  const document = useMapStore.getState().document;
  if (!document) throw new Error('Expected fixture document to be loaded.');
  return document.layers
    .filter((layer) => layer.parentId === null)
    .sort((left, right) => left.order - right.order)
    .map((layer) => layer.id);
}

describe('CommandManager', () => {
  beforeEach(() => useMapStore.getState().clear());

  it('keeps its external-store snapshot referentially stable until history changes', () => {
    const manager = loadedManager();
    const initial = manager.getSnapshot();
    expect(manager.getSnapshot()).toBe(initial);

    manager.execute(new UpdateObjectCommand(currentObject().id, { x: 2000 }));
    expect(manager.getSnapshot()).not.toBe(initial);
    expect(manager.getSnapshot()).toBe(manager.getSnapshot());
  });

  it('executes, undoes and redoes persisted object patches including a chunk move', () => {
    const manager = loadedManager();
    const events: string[] = [];
    const operations: string[] = [];
    manager.patches.subscribe((event) => {
      events.push(event.source);
      operations.push(...event.operations.map((operation) => operation.type));
    });
    const initial = currentObject();
    const command = new UpdateObjectCommand(initial.id, { x: 512, y: 512 });

    expect(manager.execute(command)).toBe(true);
    expect(currentObject()).toMatchObject({ x: 512, y: 512, chunk: { x: 0, y: 0 } });
    expect(useMapStore.getState().chunkObjectIds['0:0']).toEqual([initial.id]);

    expect(manager.undo()).toBe(true);
    expect(currentObject()).toMatchObject({
      x: initial.x,
      y: initial.y,
      chunk: initial.chunk,
    });
    expect(useMapStore.getState().chunkObjectIds['1:-1']).toEqual([initial.id]);

    expect(manager.redo()).toBe(true);
    expect(currentObject()).toMatchObject({ x: 512, y: 512, chunk: { x: 0, y: 0 } });
    expect(events).toEqual(['execute', 'undo', 'redo']);
    expect(operations).toEqual(['object.update', 'object.update', 'object.update']);
  });

  it('clears redo after a new execute', () => {
    const manager = loadedManager();
    const id = currentObject().id;
    manager.execute(new UpdateObjectCommand(id, { x: 2048 }));
    manager.undo();
    manager.execute(new UpdateObjectCommand(id, { y: 2048 }));

    expect(manager.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false, undoDepth: 1 });
    expect(currentObject()).toMatchObject({ x: 1536, y: 2048 });
  });

  it('merges nearby updates with the same merge key into one reversible history entry', () => {
    const manager = loadedManager();
    const initial = currentObject();
    manager.execute(new UpdateObjectCommand(initial.id, { x: 2000 }, 'position', undefined, 0));
    manager.execute(new UpdateObjectCommand(initial.id, { y: 2000 }, 'position', undefined, 500));

    expect(manager.getSnapshot().undoDepth).toBe(1);
    expect(currentObject()).toMatchObject({ x: 2000, y: 2000 });
    manager.undo();
    expect(currentObject()).toMatchObject({ x: initial.x, y: initial.y });
    manager.redo();
    expect(currentObject()).toMatchObject({ x: 2000, y: 2000 });
  });

  it('does not merge updates outside the merge window', () => {
    const manager = loadedManager();
    const id = currentObject().id;
    manager.execute(new UpdateObjectCommand(id, { x: 2000 }, 'position', undefined, 0));
    manager.execute(new UpdateObjectCommand(id, { y: 2000 }, 'position', undefined, 751));

    expect(manager.getSnapshot().undoDepth).toBe(2);
  });

  it('does not create a history entry for a no-op update', () => {
    const manager = loadedManager();
    const initial = currentObject();

    expect(manager.execute(new UpdateObjectCommand(initial.id, { x: initial.x }))).toBe(false);
    expect(manager.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('trims history by both entry count and byte budget', () => {
    const manager = loadedManager({ maxEntries: 1, maxBytes: 1_000_000 });
    const id = currentObject().id;
    manager.execute(new UpdateObjectCommand(id, { x: 2000 }));
    manager.execute(new UpdateObjectCommand(id, { y: 2000 }));
    expect(manager.getSnapshot().undoDepth).toBe(1);
    manager.undo();
    expect(currentObject()).toMatchObject({ x: 2000, y: -1 });

    const byteLimited = loadedManager({ maxEntries: 10, maxBytes: 1 });
    byteLimited.execute(new UpdateObjectCommand(currentObject().id, { x: 2000 }));
    expect(byteLimited.getSnapshot()).toMatchObject({ canUndo: false, estimatedBytes: 0 });
  });

  it('rolls a transaction into one history entry and restores the pre-transaction state', () => {
    const manager = loadedManager();
    const initial = currentObject();
    const transaction = manager.beginTransaction('Move and scale');
    transaction.add(new UpdateObjectCommand(initial.id, { x: 4096 }));
    transaction.add(new TransformObjectsCommand({ [initial.id]: { scaleX: 2, scaleY: 2 } }));

    expect(transaction.commit()).toBe(true);
    expect(manager.getSnapshot().undoDepth).toBe(1);
    expect(currentObject()).toMatchObject({ x: 4096, scaleX: 2, scaleY: 2 });
    manager.undo();
    expect(currentObject()).toMatchObject({
      x: initial.x,
      scaleX: initial.scaleX,
      scaleY: initial.scaleY,
    });
    manager.redo();
    expect(currentObject()).toMatchObject({ x: 4096, scaleX: 2, scaleY: 2 });
  });

  it('moves layer objects during deletion and restores both order and ownership on undo', () => {
    const manager = loadedManager();
    const document = useMapStore.getState().document;
    if (!document) throw new Error('Expected fixture document to be loaded.');
    const sourceLayer = document.layers[1];
    if (!sourceLayer) throw new Error('Expected fixture stamp layer to be loaded.');
    const targetLayer = {
      ...sourceLayer,
      id: '10000000-0000-4000-8000-000000000009',
      name: 'Labels',
      order: 2,
    };

    manager.execute(new CreateLayerCommand(targetLayer));
    manager.execute(new DeleteLayerCommand(sourceLayer.id, 'move', targetLayer.id));
    expect(currentObject().layerId).toBe(targetLayer.id);
    expect(rootLayerIds()).toEqual([document.layers[0]?.id, targetLayer.id]);

    manager.undo();
    expect(currentObject().layerId).toBe(sourceLayer.id);
    expect(rootLayerIds()).toEqual([document.layers[0]?.id, sourceLayer.id, targetLayer.id]);
  });

  it('does not retain history or mutate state when a patch batch is rejected', () => {
    const manager = loadedManager();
    const initial = currentObject();
    const invalid: EditorCommand = {
      id: 'invalid',
      label: 'Invalid',
      execute: () => ({
        patches: [
          {
            type: 'object.delete',
            objectId: '10000000-0000-4000-8000-000000000099',
            operation: null,
          },
        ],
      }),
      undo: () => ({ patches: [] }),
      redo: () => ({ patches: [] }),
      estimateBytes: () => 1,
    };

    expect(() => manager.execute(invalid)).toThrow('does not exist');
    expect(currentObject()).toEqual(initial);
    expect(manager.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
  });
});
