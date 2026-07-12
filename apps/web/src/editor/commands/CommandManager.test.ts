import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMapChunkPayloadFixture,
  createMapDocumentFixture,
  createPathMapObjectFixture,
  createStampMapObjectFixture,
  createTerrainStrokeMapObjectFixture,
  createMarkerMapObjectFixture,
  createLocationFixture,
} from '@fantasy-map/map-model/fixtures';
import type { MapObject } from '@fantasy-map/map-model';

import { useMapStore } from '../../stores/map-store.js';
import { CommandManager } from './CommandManager.js';
import {
  CreateLayerCommand,
  CreateLocationCommand,
  CreatePathCommand,
  DrawTerrainStrokeCommand,
  DeleteLayerCommand,
  TransformObjectsCommand,
  UpdateLayerCommand,
  UpdateObjectCommand,
  UpdatePathGeometryCommand,
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

  it('creates and undoes a location with its marker as one atomic patch batch', () => {
    const manager = loadedManager();
    const location = createLocationFixture();
    const existingLayerId = useMapStore.getState().document?.layers[1]?.id;
    if (!existingLayerId) throw new Error('Expected fixture layer.');
    const marker = { ...createMarkerMapObjectFixture(), layerId: existingLayerId };
    const events: string[][] = [];
    manager.patches.subscribe((event) => events.push(event.operations.map((operation) => operation.type)));

    expect(manager.execute(new CreateLocationCommand(location, marker))).toBe(true);
    expect(useMapStore.getState().locationsById[location.id]?.markerObjectId).toBe(marker.id);
    expect(useMapStore.getState().objectsById[marker.id]).toMatchObject({ locationId: location.id });
    expect(events[0]).toEqual(['location.create', 'object.create']);

    expect(manager.undo()).toBe(true);
    expect(useMapStore.getState().locationsById[location.id]).toBeUndefined();
    expect(useMapStore.getState().objectsById[marker.id]).toBeUndefined();
    expect(events[1]).toEqual(['object.delete', 'location.delete']);
  });

  it('moves a marker and its location in one smooth-transform operation batch', () => {
    const manager = loadedManager();
    const location = createLocationFixture();
    const existingLayerId = useMapStore.getState().document?.layers[1]?.id;
    if (!existingLayerId) throw new Error('Expected fixture layer.');
    const marker = { ...createMarkerMapObjectFixture(), layerId: existingLayerId };
    manager.execute(new CreateLocationCommand(location, marker));
    const batches: string[][] = [];
    manager.patches.subscribe((event) => batches.push(event.operations.map((operation) => operation.type)));

    manager.execute(new TransformObjectsCommand({
      [marker.id]: { x: marker.x + 120, y: marker.y + 80, rotation: marker.rotation, scaleX: marker.scaleX, scaleY: marker.scaleY },
    }));
    expect(useMapStore.getState().objectsById[marker.id]).toMatchObject({ x: marker.x + 120, y: marker.y + 80 });
    expect(useMapStore.getState().locationsById[location.id]).toMatchObject({ x: marker.x + 120, y: marker.y + 80 });
    expect(batches[0]).toEqual(['object.update', 'location.update']);

    manager.undo();
    expect(useMapStore.getState().locationsById[location.id]).toMatchObject({ x: location.x, y: location.y });
  });

  it('creates and edits path geometry through persisted object operations', () => {
    const manager = loadedManager();
    const path = createPathMapObjectFixture();
    const operations: unknown[] = [];
    manager.patches.subscribe((event) => operations.push(...event.operations));
    const sourceLayer = useMapStore.getState().document?.layers[1];
    if (!sourceLayer) throw new Error('Expected fixture layer.');
    const pathLayer = {
      ...sourceLayer,
      id: path.layerId,
      name: 'Paths',
      type: 'vector-path' as const,
      order: 2,
    };

    const transaction = manager.beginTransaction('Create path layer and object');
    transaction.add(new CreateLayerCommand(pathLayer));
    transaction.add(new CreatePathCommand(path));
    expect(transaction.commit()).toBe(true);
    expect(useMapStore.getState().objectsById[path.id]).toMatchObject({ type: 'path' });

    const nodes = path.nodes.map((node, index) =>
      index === 1 ? { ...node, anchor: { x: 720, y: 560 } } : node,
    );
    expect(manager.execute(new UpdatePathGeometryCommand(path.id, nodes))).toBe(true);
    expect(useMapStore.getState().objectsById[path.id]).toMatchObject({ nodes });
    expect(
      operations.filter((operation) => (operation as { type: string }).type.startsWith('object.')),
    ).toMatchObject([
      { type: 'object.create', object: { type: 'path' } },
      { type: 'object.update', objectId: path.id, changes: { nodes } },
    ]);

    manager.undo();
    expect(useMapStore.getState().objectsById[path.id]).toMatchObject({ nodes: path.nodes });
    manager.undo();
    expect(useMapStore.getState().objectsById[path.id]).toBeUndefined();
    expect(useMapStore.getState().layersById[path.layerId]).toBeUndefined();
  });

  it('records one terrain stroke as one history entry and one operation batch', () => {
    const manager = loadedManager();
    const stroke = createTerrainStrokeMapObjectFixture();
    const sourceLayer = useMapStore.getState().document?.layers[1];
    if (!sourceLayer) throw new Error('Expected fixture layer.');
    const terrainLayer = {
      ...sourceLayer,
      id: stroke.layerId,
      name: 'Terrain',
      type: 'raster' as const,
      order: 2,
    };
    const batches: unknown[][] = [];
    manager.patches.subscribe((event) => batches.push([...event.operations]));

    const setup = manager.beginTransaction('Create terrain layer');
    setup.add(new CreateLayerCommand(terrainLayer));
    setup.commit();
    batches.length = 0;

    expect(manager.execute(new DrawTerrainStrokeCommand(stroke))).toBe(true);
    expect(manager.getSnapshot().undoDepth).toBe(2);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject([
      { type: 'object.create', object: { type: 'terrain-stroke' } },
    ]);
    expect(manager.undo()).toBe(true);
    expect(useMapStore.getState().objectsById[stroke.id]).toBeUndefined();
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

  it('allows a locked layer to be unlocked and merges continuous opacity changes', () => {
    const manager = loadedManager();
    const layer = useMapStore.getState().document?.layers[1];
    if (!layer) throw new Error('Expected fixture stamp layer to be loaded.');
    manager.execute(new UpdateLayerCommand(layer.id, { locked: true }));
    manager.execute(new UpdateLayerCommand(layer.id, { locked: false }));
    manager.execute(new UpdateLayerCommand(layer.id, { opacity: 0.8 }, 'opacity', 0));
    manager.execute(new UpdateLayerCommand(layer.id, { opacity: 0.4 }, 'opacity', 500));

    expect(useMapStore.getState().layersById[layer.id]).toMatchObject({
      locked: false,
      opacity: 0.4,
    });
    expect(manager.getSnapshot().undoDepth).toBe(3);
    manager.undo();
    expect(useMapStore.getState().layersById[layer.id]?.opacity).toBe(1);
  });

  it('rejects object edits through a hidden layer', () => {
    const manager = loadedManager();
    const objectValue = currentObject();
    manager.execute(new UpdateLayerCommand(objectValue.layerId, { visible: false }));

    expect(() => manager.execute(new UpdateObjectCommand(objectValue.id, { x: 2000 }))).toThrow(
      'is not editable',
    );
    expect(currentObject().x).toBe(objectValue.x);
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
