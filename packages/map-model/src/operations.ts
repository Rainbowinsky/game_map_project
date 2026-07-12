import { z } from 'zod';

import {
  blendModeSchema,
  mapBackgroundSchema,
  mapLayerInputSchema,
  mapSettingsSchema,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
} from './document.js';
import { locationChangesSchema, locationInputSchema } from './locations.js';
import {
  markerMapObjectInputSchema,
  hasByteLimit,
  metadataSchema,
  pathMapObjectInputSchema,
  regionMapObjectInputSchema,
  stampKindSchema,
  stampMapObjectInputSchema,
  terrainBrushSchema,
  terrainKindSchema,
  terrainStrokeMapObjectInputSchema,
  terrainStrokePointSchema,
  pathKindSchema,
  pathNodeSchema,
  textAlignSchema,
  textMapObjectInputSchema,
  tokenIdentifierSchema,
  type MapObject,
} from './objects.js';
import {
  colorSchema,
  entityIdSchema,
  isoUtcDateTimeSchema,
  MAP_MODEL_SCHEMA_VERSION,
  MAX_OBJECT_SCALE,
  MIN_OBJECT_SCALE,
  worldCoordinateSchema,
  worldPointSchema,
} from './primitives.js';

function hasOwnChanges(value: object): boolean {
  return Object.keys(value).length > 0;
}

export const MAX_OPERATION_BATCH_BYTES = 2 * 1_024 * 1_024;

const commonObjectChangesShape = {
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
} as const;

function strictChanges<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .object(shape)
    .strict()
    .refine(hasOwnChanges, { message: 'Object changes cannot be empty.' });
}

export const stampObjectChangesSchema = strictChanges({
  ...commonObjectChangesShape,
  assetId: entityIdSchema.optional(),
  stampKind: stampKindSchema.optional(),
  tint: colorSchema.nullable().optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  randomSeed: z.number().int().min(0).max(4_294_967_295).optional(),
});

export const terrainStrokeObjectChangesSchema = strictChanges({
  ...commonObjectChangesShape,
  terrainKind: terrainKindSchema.optional(),
  brush: terrainBrushSchema.optional(),
  points: z.array(terrainStrokePointSchema).min(2).max(20_000).optional(),
  randomSeed: z.number().int().min(0).max(4_294_967_295).optional(),
  styleToken: tokenIdentifierSchema.optional(),
});

export const regionObjectChangesSchema = strictChanges({
  ...commonObjectChangesShape,
  vertices: z.array(worldPointSchema).min(3).max(10_000).optional(),
  fillToken: tokenIdentifierSchema.optional(),
  strokeToken: tokenIdentifierSchema.optional(),
  strokeWidth: z.number().finite().positive().max(10_000).optional(),
});

export const pathObjectChangesSchema = strictChanges({
  ...commonObjectChangesShape,
  pathKind: pathKindSchema.optional(),
  nodes: z.array(pathNodeSchema).min(2).max(10_000).optional(),
  styleToken: tokenIdentifierSchema.optional(),
  widthStart: z.number().finite().positive().max(10_000).optional(),
  widthEnd: z.number().finite().positive().max(10_000).optional(),
});

export const textObjectChangesSchema = strictChanges({
  ...commonObjectChangesShape,
  text: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .refine((value) => !/[<>]/.test(value), 'Text must not contain HTML markup.')
    .refine((value) => value.split('\n').length <= 20, 'Text cannot exceed 20 lines.')
    .optional(),
  fontSize: z.number().finite().min(4).max(512).optional(),
  align: textAlignSchema.optional(),
  fontToken: tokenIdentifierSchema.optional(),
  colorToken: tokenIdentifierSchema.optional(),
});

export const markerObjectChangesSchema = strictChanges({
  ...commonObjectChangesShape,
  locationId: entityIdSchema.optional(),
  iconAssetId: entityIdSchema.nullable().optional(),
  minZoom: z.number().finite().positive().max(1_024).nullable().optional(),
  maxZoom: z.number().finite().positive().max(1_024).nullable().optional(),
});

/**
 * Parses only fields that are legal for at least one object subtype. The API
 * chooses the subtype-specific schema after loading the target object, which
 * prevents a stamp from being converted into another object through updates.
 */
export const objectChangesSchema = z.union([
  stampObjectChangesSchema,
  terrainStrokeObjectChangesSchema,
  regionObjectChangesSchema,
  pathObjectChangesSchema,
  textObjectChangesSchema,
  markerObjectChangesSchema,
]);

export const objectChangesSchemaByType = {
  stamp: stampObjectChangesSchema,
  'terrain-stroke': terrainStrokeObjectChangesSchema,
  region: regionObjectChangesSchema,
  path: pathObjectChangesSchema,
  text: textObjectChangesSchema,
  marker: markerObjectChangesSchema,
} as const;

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
    object: z.union([
      stampMapObjectInputSchema,
      terrainStrokeMapObjectInputSchema,
      regionMapObjectInputSchema,
      pathMapObjectInputSchema,
      textMapObjectInputSchema,
      markerMapObjectInputSchema,
    ]),
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

const locationCreateOperationSchema = z
  .object({
    type: z.literal('location.create'),
    location: locationInputSchema,
  })
  .strict();

const locationUpdateOperationSchema = z
  .object({
    type: z.literal('location.update'),
    locationId: entityIdSchema,
    changes: locationChangesSchema,
  })
  .strict();

const locationDeleteOperationSchema = z
  .object({
    type: z.literal('location.delete'),
    locationId: entityIdSchema,
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
  locationCreateOperationSchema,
  locationUpdateOperationSchema,
  locationDeleteOperationSchema,
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
  .strict()
  .superRefine((request, context) => {
    if (!hasByteLimit(request.operations, MAX_OPERATION_BATCH_BYTES)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operations'],
        message: `Operation batch cannot exceed ${MAX_OPERATION_BATCH_BYTES} UTF-8 bytes.`,
      });
    }
  });

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

export function objectChangesForType(type: MapObject['type'], changes: unknown): ObjectChanges {
  return objectChangesSchemaByType[type].parse(changes) as ObjectChanges;
}
