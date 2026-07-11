import {
  chunkKey,
  mapDocumentSchema,
  mapLayerSchema,
  mapObjectSchema,
  objectChangesSchema,
  toChunkCoordinate,
  type LayerChanges,
  type MapDocument,
  type MapLayer,
  type MapLayerInput,
  type MapObject,
  type MapOperation,
  type ObjectChanges,
  type StampMapObjectInput,
} from '@fantasy-map/map-model';

import type {
  CommandContext,
  CommandExecution,
  DomainPatch,
  EditorCommand,
  TransformChanges,
} from './domain-patch.js';

const OBJECT_CHANGE_KEYS = [
  'x',
  'y',
  'rotation',
  'scaleX',
  'scaleY',
  'layerId',
  'name',
  'zIndex',
  'visible',
  'locked',
  'opacity',
  'metadata',
  'assetId',
  'stampKind',
  'tint',
  'flipX',
  'flipY',
  'randomSeed',
] as const satisfies readonly (keyof ObjectChanges)[];

const LAYER_CHANGE_KEYS = [
  'parentId',
  'name',
  'visible',
  'locked',
  'opacity',
  'blendMode',
] as const satisfies readonly (keyof LayerChanges)[];

export const DEFAULT_COMMAND_MERGE_WINDOW_MS = 750;

function estimate(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function objectInput(object: MapObject): StampMapObjectInput {
  const omitted = new Set(['mapId', 'chunk', 'revision', 'createdAt', 'updatedAt']);
  return Object.fromEntries(
    Object.entries(object).filter(([key]) => !omitted.has(key)),
  ) as StampMapObjectInput;
}

function layerInput(layer: MapLayer): MapLayerInput {
  const omitted = new Set(['mapId', 'createdAt', 'updatedAt']);
  return Object.fromEntries(
    Object.entries(layer).filter(([key]) => !omitted.has(key)),
  ) as MapLayerInput;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedObjectFields(before: MapObject, after: MapObject): ObjectChanges {
  const changes: Partial<ObjectChanges> = {};
  for (const key of OBJECT_CHANGE_KEYS) {
    if (!sameValue(before[key], after[key])) {
      Object.assign(changes, { [key]: after[key] });
    }
  }
  return objectChangesSchema.parse(changes);
}

function hasChangedObjectFields(before: MapObject, after: MapObject): boolean {
  return OBJECT_CHANGE_KEYS.some((key) => !sameValue(before[key], after[key]));
}

function changedLayerFields(before: MapLayer, after: MapLayer): LayerChanges {
  const changes: Partial<LayerChanges> = {};
  for (const key of LAYER_CHANGE_KEYS) {
    if (!sameValue(before[key], after[key])) {
      Object.assign(changes, { [key]: after[key] });
    }
  }
  if (Object.keys(changes).length === 0) throw new Error('Layer changes cannot be empty.');
  return changes as LayerChanges;
}

function hasChangedLayerFields(before: MapLayer, after: MapLayer): boolean {
  return LAYER_CHANGE_KEYS.some((key) => !sameValue(before[key], after[key]));
}

function normalizedObject(context: CommandContext, object: MapObject): MapObject {
  const document = context.getDocument();
  return mapObjectSchema.parse({
    ...object,
    chunk: toChunkCoordinate({ x: object.x, y: object.y }, document.settings.chunkSize),
  });
}

function objectPatch(before: MapObject, after: MapObject): DomainPatch {
  return {
    type: 'object.replace',
    object: after,
    operation: {
      type: 'object.update',
      objectId: after.id,
      changes: changedObjectFields(before, after),
    },
  };
}

function ensureEditableObject(context: CommandContext, object: MapObject): void {
  if (object.locked) throw new Error(`Object ${object.id} is locked.`);
  if (context.getLayer(object.layerId)?.locked) {
    throw new Error(`Layer ${object.layerId} is locked.`);
  }
}

function ensureEditableLayer(context: CommandContext, layer: MapLayer): void {
  if (layer.locked) throw new Error(`Layer ${layer.id} is locked.`);
  if (layer.parentId !== null && context.getLayer(layer.parentId)?.locked) {
    throw new Error(`Parent layer ${layer.parentId} is locked.`);
  }
}

function siblingLayerIds(context: CommandContext, parentId: string | null): string[] {
  return context
    .getDocument()
    .layers.filter((layer) => layer.parentId === parentId)
    .sort((left, right) => left.order - right.order)
    .map((layer) => layer.id);
}

function reorderPatch(parentId: string | null, orderedLayerIds: readonly string[]): DomainPatch {
  return {
    type: 'layer.reorder',
    parentId,
    orderedLayerIds: [...orderedLayerIds],
    operation: { type: 'layer.reorder', parentId, orderedLayerIds: [...orderedLayerIds] },
  };
}

abstract class SnapshotCommand implements EditorCommand {
  abstract readonly id: string;
  abstract readonly label: string;

  protected forward: readonly DomainPatch[] | undefined;
  protected inverse: readonly DomainPatch[] | undefined;

  abstract execute(context: CommandContext): CommandExecution;

  undo(): CommandExecution {
    if (!this.inverse) throw new Error('Cannot undo a command that has not executed.');
    return { patches: this.inverse };
  }

  redo(): CommandExecution {
    if (!this.forward) throw new Error('Cannot redo a command that has not executed.');
    return { patches: this.forward };
  }

  estimateBytes(): number {
    return estimate([this.forward, this.inverse]);
  }
}

export class CreateObjectCommand extends SnapshotCommand {
  readonly id = 'object.create';
  readonly label = 'Create object';

  constructor(private readonly requestedObject: MapObject) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    if (context.getObject(this.requestedObject.id)) {
      throw new Error(`Object ${this.requestedObject.id} already exists.`);
    }
    const layer = context.getLayer(this.requestedObject.layerId);
    if (!layer) throw new Error(`Layer ${this.requestedObject.layerId} does not exist.`);
    ensureEditableLayer(context, layer);

    const object = normalizedObject(context, this.requestedObject);
    const create: DomainPatch = {
      type: 'object.create',
      object,
      operation: { type: 'object.create', object: objectInput(object) },
    };
    this.forward = [create];
    this.inverse = [
      {
        type: 'object.delete',
        objectId: object.id,
        operation: { type: 'object.delete', objectId: object.id },
      },
    ];
    return { patches: this.forward };
  }
}

export class UpdateObjectCommand extends SnapshotCommand {
  readonly id = 'object.update';
  readonly label: string;
  readonly createdAt: number;

  private before: MapObject | undefined;
  private after: MapObject | undefined;
  private lastMergedAt: number;

  constructor(
    readonly objectId: string,
    private readonly changes: ObjectChanges,
    readonly mergeKey?: string,
    label = 'Update object',
    createdAt = Date.now(),
  ) {
    super();
    this.label = label;
    this.createdAt = createdAt;
    this.lastMergedAt = createdAt;
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    const current = context.getObject(this.objectId);
    if (!current) throw new Error(`Object ${this.objectId} does not exist.`);
    ensureEditableObject(context, current);
    if (this.changes.layerId !== undefined) {
      const targetLayer = context.getLayer(this.changes.layerId);
      if (!targetLayer) throw new Error(`Target layer ${this.changes.layerId} does not exist.`);
      ensureEditableLayer(context, targetLayer);
    }

    const next = normalizedObject(context, mapObjectSchema.parse({ ...current, ...this.changes }));
    if (!hasChangedObjectFields(current, next)) return { patches: [] };
    const forward = objectPatch(current, next);
    const inverse = objectPatch(next, current);
    this.before = current;
    this.after = next;
    this.forward = [forward];
    this.inverse = [inverse];
    return { patches: this.forward };
  }

  mergeWith(next: EditorCommand): EditorCommand | undefined {
    if (!(next instanceof UpdateObjectCommand)) return undefined;
    if (
      !this.mergeKey ||
      this.mergeKey !== next.mergeKey ||
      this.objectId !== next.objectId ||
      next.createdAt - this.lastMergedAt > DEFAULT_COMMAND_MERGE_WINDOW_MS ||
      !this.before ||
      !next.after
    ) {
      return undefined;
    }
    this.after = next.after;
    this.forward = [objectPatch(this.before, next.after)];
    this.inverse = [objectPatch(next.after, this.before)];
    this.lastMergedAt = next.createdAt;
    return this;
  }
}

export class DeleteObjectCommand extends SnapshotCommand {
  readonly id = 'object.delete';
  readonly label = 'Delete object';

  constructor(private readonly objectId: string) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    const object = context.getObject(this.objectId);
    if (!object) throw new Error(`Object ${this.objectId} does not exist.`);
    ensureEditableObject(context, object);
    this.forward = [
      {
        type: 'object.delete',
        objectId: object.id,
        operation: { type: 'object.delete', objectId: object.id },
      },
    ];
    this.inverse = [
      {
        type: 'object.create',
        object,
        operation: { type: 'object.create', object: objectInput(object) },
      },
    ];
    return { patches: this.forward };
  }
}

export class TransformObjectsCommand extends SnapshotCommand {
  readonly id = 'object.transform';
  readonly label = 'Transform objects';

  constructor(private readonly changesById: Readonly<Record<string, TransformChanges>>) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    const entries = Object.entries(this.changesById);
    if (entries.length === 0) throw new Error('A transform command requires at least one object.');

    const forward: DomainPatch[] = [];
    const inverse: DomainPatch[] = [];
    for (const [objectId, changes] of entries) {
      const current = context.getObject(objectId);
      if (!current) throw new Error(`Object ${objectId} does not exist.`);
      ensureEditableObject(context, current);
      const next = normalizedObject(context, mapObjectSchema.parse({ ...current, ...changes }));
      if (!hasChangedObjectFields(current, next)) continue;
      forward.push(objectPatch(current, next));
      inverse.unshift(objectPatch(next, current));
    }
    this.forward = forward;
    this.inverse = inverse;
    return { patches: forward };
  }
}

export class CreateLayerCommand extends SnapshotCommand {
  readonly id = 'layer.create';
  readonly label = 'Create layer';

  constructor(private readonly layer: MapLayer) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    if (context.getLayer(this.layer.id)) throw new Error(`Layer ${this.layer.id} already exists.`);
    if (this.layer.mapId !== context.getDocument().id)
      throw new Error('Layer belongs to another map.');
    if (this.layer.parentId !== null) {
      const parent = context.getLayer(this.layer.parentId);
      if (!parent) throw new Error(`Parent layer ${this.layer.parentId} does not exist.`);
      ensureEditableLayer(context, parent);
    }
    const layer = mapLayerSchema.parse(this.layer);
    const before = siblingLayerIds(context, layer.parentId);
    const after = [...before];
    after.splice(Math.min(layer.order, after.length), 0, layer.id);
    this.forward = [
      {
        type: 'layer.create',
        layer,
        operation: { type: 'layer.create', layer: layerInput(layer) },
      },
      reorderPatch(layer.parentId, after),
    ];
    this.inverse = [
      {
        type: 'layer.delete',
        layerId: layer.id,
        operation: { type: 'layer.delete', layerId: layer.id, objectPolicy: 'delete' },
      },
      reorderPatch(layer.parentId, before),
    ];
    return { patches: this.forward };
  }
}

export class UpdateLayerCommand extends SnapshotCommand {
  readonly id = 'layer.update';
  readonly label = 'Update layer';

  constructor(
    private readonly layerId: string,
    private readonly changes: LayerChanges,
  ) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    const current = context.getLayer(this.layerId);
    if (!current) throw new Error(`Layer ${this.layerId} does not exist.`);
    ensureEditableLayer(context, current);
    if (this.changes.parentId !== undefined && this.changes.parentId !== current.parentId) {
      throw new Error('Changing a layer parent requires a dedicated move command.');
    }

    const next = mapLayerSchema.parse({ ...current, ...this.changes });
    if (!hasChangedLayerFields(current, next)) return { patches: [] };
    this.forward = [
      {
        type: 'layer.replace',
        layer: next,
        operation: {
          type: 'layer.update',
          layerId: next.id,
          changes: changedLayerFields(current, next),
        },
      },
    ];
    this.inverse = [
      {
        type: 'layer.replace',
        layer: current,
        operation: {
          type: 'layer.update',
          layerId: current.id,
          changes: changedLayerFields(next, current),
        },
      },
    ];
    return { patches: this.forward };
  }
}

export class DeleteLayerCommand extends SnapshotCommand {
  readonly id = 'layer.delete';
  readonly label = 'Delete layer';

  constructor(
    private readonly layerId: string,
    private readonly objectPolicy: 'delete' | 'move',
    private readonly targetLayerId?: string,
  ) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    const layer = context.getLayer(this.layerId);
    if (!layer) throw new Error(`Layer ${this.layerId} does not exist.`);
    ensureEditableLayer(context, layer);
    if (layer.type === 'background') throw new Error('The background layer cannot be deleted.');
    if (this.objectPolicy === 'move' && !this.targetLayerId) {
      throw new Error('A target layer is required when moving layer objects.');
    }
    const target = this.targetLayerId ? context.getLayer(this.targetLayerId) : undefined;
    if (this.objectPolicy === 'move' && (!target || target.id === layer.id)) {
      throw new Error('A different target layer is required when moving layer objects.');
    }
    if (target) ensureEditableLayer(context, target);

    const objects = context.getObjectsInLayer(layer.id);
    const siblingIds = siblingLayerIds(context, layer.parentId);
    const remainingSiblingIds = siblingIds.filter((siblingId) => siblingId !== layer.id);
    const forward: DomainPatch[] = [];
    const inverse: DomainPatch[] = [
      {
        type: 'layer.create',
        layer,
        operation: { type: 'layer.create', layer: layerInput(layer) },
      },
      reorderPatch(layer.parentId, siblingIds),
    ];

    if (this.objectPolicy === 'delete') {
      for (const object of objects) {
        ensureEditableObject(context, object);
        forward.push({ type: 'object.delete', objectId: object.id, operation: null });
        inverse.push({
          type: 'object.create',
          object,
          operation: { type: 'object.create', object: objectInput(object) },
        });
      }
    } else if (target) {
      for (const object of objects) {
        ensureEditableObject(context, object);
        const moved = mapObjectSchema.parse({ ...object, layerId: target.id });
        forward.push({ type: 'object.replace', object: moved, operation: null });
        inverse.push(objectPatch(moved, object));
      }
    }

    forward.push({
      type: 'layer.delete',
      layerId: layer.id,
      operation: {
        type: 'layer.delete',
        layerId: layer.id,
        objectPolicy: this.objectPolicy,
        ...(this.targetLayerId ? { targetLayerId: this.targetLayerId } : {}),
      },
    });
    forward.push(reorderPatch(layer.parentId, remainingSiblingIds));
    this.forward = forward;
    this.inverse = inverse;
    return { patches: forward };
  }
}

export class ReorderLayersCommand extends SnapshotCommand {
  readonly id = 'layer.reorder';
  readonly label = 'Reorder layers';

  constructor(
    private readonly parentId: string | null,
    private readonly orderedLayerIds: readonly string[],
  ) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    const before = Object.values(context.getDocument().layers)
      .filter((layer) => layer.parentId === this.parentId)
      .sort((left, right) => left.order - right.order)
      .map((layer) => layer.id);
    if (
      before.length !== this.orderedLayerIds.length ||
      before.some((layerId) => !this.orderedLayerIds.includes(layerId))
    ) {
      throw new Error('Layer reorder must contain every sibling exactly once.');
    }
    for (const layerId of before) {
      const layer = context.getLayer(layerId);
      if (!layer) throw new Error(`Layer ${layerId} does not exist.`);
      ensureEditableLayer(context, layer);
    }
    const operation: MapOperation = {
      type: 'layer.reorder',
      parentId: this.parentId,
      orderedLayerIds: [...this.orderedLayerIds],
    };
    this.forward = [
      {
        type: 'layer.reorder',
        parentId: this.parentId,
        orderedLayerIds: [...this.orderedLayerIds],
        operation,
      },
    ];
    this.inverse = [
      {
        type: 'layer.reorder',
        parentId: this.parentId,
        orderedLayerIds: before,
        operation: { type: 'layer.reorder', parentId: this.parentId, orderedLayerIds: before },
      },
    ];
    return { patches: this.forward };
  }
}

export class UpdateMapMetadataCommand extends SnapshotCommand {
  readonly id = 'map.update';
  readonly label = 'Update map';

  constructor(private readonly changes: Extract<MapOperation, { readonly type: 'map.update' }>) {
    super();
  }

  execute(context: CommandContext): CommandExecution {
    if (this.forward) return this.redo();
    const current = context.getDocument();
    const next = mapDocumentSchema.parse({ ...current, ...this.changes.changes });
    this.forward = [{ type: 'document.replace', document: next, operation: this.changes }];
    this.inverse = [
      {
        type: 'document.replace',
        document: current,
        operation: {
          type: 'map.update',
          changes: Object.fromEntries(
            Object.keys(this.changes.changes).map((key) => [
              key,
              current[key as keyof MapDocument],
            ]),
          ) as Extract<MapOperation, { readonly type: 'map.update' }>['changes'],
        },
      },
    ];
    return { patches: this.forward };
  }
}

export function objectChunkKey(object: MapObject): string {
  return chunkKey(object.chunk);
}
