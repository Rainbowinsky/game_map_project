import { z } from 'zod';

import {
  mapBackgroundSchema,
  mapLayerInputSchema,
  mapSettingsSchema,
  blendModeSchema,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
} from './document.js';
import { metadataSchema, stampKindSchema, stampMapObjectInputSchema } from './objects.js';
import {
  colorSchema,
  entityIdSchema,
  isoUtcDateTimeSchema,
  MAP_MODEL_SCHEMA_VERSION,
  MAX_OBJECT_SCALE,
  MIN_OBJECT_SCALE,
  worldCoordinateSchema,
} from './primitives.js';

function hasOwnChanges(value: object): boolean {
  return Object.keys(value).length > 0;
}

export const objectChangesSchema = z
  .object({
    x: worldCoordinateSchema.optional(),
    y: worldCoordinateSchema.optional(),
    rotation: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
    scaleX: z.number().finite().min(MIN_OBJECT_SCALE).max(MAX_OBJECT_SCALE).optional(),
    scaleY: z.number().finite().min(MIN_OBJECT_SCALE).max(MAX_OBJECT_SCALE).optional(),
    layerId: entityIdSchema.optional(),
    name: z.string().trim().min(1).max(120).nullable().optional(),
    zIndex: z.number().int().safe().optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    metadata: metadataSchema.optional(),
    assetId: entityIdSchema.optional(),
    stampKind: stampKindSchema.optional(),
    tint: colorSchema.nullable().optional(),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
    randomSeed: z.number().int().min(0).max(4_294_967_295).optional(),
  })
  .strict()
  .refine(hasOwnChanges, { message: 'Object changes cannot be empty.' });

export const layerChangesSchema = z
  .object({
    parentId: entityIdSchema.nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    blendMode: blendModeSchema.optional(),
  })
  .strict()
  .refine(hasOwnChanges, { message: 'Layer changes cannot be empty.' });

export const mapMetadataChangesSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    width: z.number().finite().min(MAP_MIN_SIZE).max(MAP_MAX_SIZE).optional(),
    height: z.number().finite().min(MAP_MIN_SIZE).max(MAP_MAX_SIZE).optional(),
    themeId: z.string().trim().min(1).max(128).optional(),
    background: mapBackgroundSchema.optional(),
    settings: mapSettingsSchema.optional(),
  })
  .strict()
  .refine(hasOwnChanges, { message: 'Map metadata changes cannot be empty.' });

const objectCreateOperationSchema = z
  .object({
    type: z.literal('object.create'),
    object: stampMapObjectInputSchema,
  })
  .strict();

const objectUpdateOperationSchema = z
  .object({
    type: z.literal('object.update'),
    objectId: entityIdSchema,
    changes: objectChangesSchema,
  })
  .strict();

const objectDeleteOperationSchema = z
  .object({
    type: z.literal('object.delete'),
    objectId: entityIdSchema,
  })
  .strict();

const objectReorderOperationSchema = z
  .object({
    type: z.literal('object.reorder'),
    layerId: entityIdSchema,
    orderedObjectIds: z.array(entityIdSchema).max(50_000),
  })
  .strict();

const layerCreateOperationSchema = z
  .object({
    type: z.literal('layer.create'),
    layer: mapLayerInputSchema,
  })
  .strict();

const layerUpdateOperationSchema = z
  .object({
    type: z.literal('layer.update'),
    layerId: entityIdSchema,
    changes: layerChangesSchema,
  })
  .strict();

const layerReorderOperationSchema = z
  .object({
    type: z.literal('layer.reorder'),
    parentId: entityIdSchema.nullable(),
    orderedLayerIds: z.array(entityIdSchema).max(5_000),
  })
  .strict();

const layerDeleteOperationSchema = z
  .object({
    type: z.literal('layer.delete'),
    layerId: entityIdSchema,
    objectPolicy: z.enum(['delete', 'move']),
    targetLayerId: entityIdSchema.optional(),
  })
  .strict()
  .superRefine((operation, context) => {
    if (operation.objectPolicy === 'move' && operation.targetLayerId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetLayerId'],
        message: 'targetLayerId is required when moving objects.',
      });
    }

    if (operation.objectPolicy === 'delete' && operation.targetLayerId !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetLayerId'],
        message: 'targetLayerId is not valid when deleting objects.',
      });
    }
  });

const mapUpdateOperationSchema = z
  .object({
    type: z.literal('map.update'),
    changes: mapMetadataChangesSchema,
  })
  .strict();

export const mapOperationSchema = z.union([
  objectCreateOperationSchema,
  objectUpdateOperationSchema,
  objectDeleteOperationSchema,
  objectReorderOperationSchema,
  layerCreateOperationSchema,
  layerUpdateOperationSchema,
  layerReorderOperationSchema,
  layerDeleteOperationSchema,
  mapUpdateOperationSchema,
]);

export const applyOperationsRequestSchema = z
  .object({
    schemaVersion: z.literal(MAP_MODEL_SCHEMA_VERSION),
    baseRevision: z.number().int().safe().nonnegative(),
    clientMutationId: entityIdSchema,
    operations: z.array(mapOperationSchema).min(1).max(500),
  })
  .strict();

export const applyOperationsResponseSchema = z
  .object({
    mapId: entityIdSchema,
    acceptedMutationId: entityIdSchema,
    previousRevision: z.number().int().safe().nonnegative(),
    revision: z.number().int().safe().nonnegative(),
    updatedAt: isoUtcDateTimeSchema,
    changedChunkKeys: z.array(z.string().regex(/^-?\d+:-?\d+$/)).max(10_000),
  })
  .strict()
  .refine((response) => response.revision >= response.previousRevision, {
    message: 'Response revision cannot precede previousRevision.',
    path: ['revision'],
  });

export type ObjectChanges = z.infer<typeof objectChangesSchema>;
export type LayerChanges = z.infer<typeof layerChangesSchema>;
export type MapMetadataChanges = z.infer<typeof mapMetadataChangesSchema>;
export type MapOperation = z.infer<typeof mapOperationSchema>;
export type ApplyOperationsRequest = z.infer<typeof applyOperationsRequestSchema>;
export type ApplyOperationsResponse = z.infer<typeof applyOperationsResponseSchema>;
