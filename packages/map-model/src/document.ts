import { z } from 'zod';

import { chunkSizeSchema } from './chunks.js';
import {
  colorSchema,
  entityIdSchema,
  isoUtcDateTimeSchema,
  MAP_MODEL_SCHEMA_VERSION,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
} from './primitives.js';

export const MAP_MIN_SIZE = 1_000;
export const MAP_MAX_SIZE = 1_000_000;

export const mapLayerTypeSchema = z.enum([
  'background',
  'raster',
  'vector-path',
  'stamp',
  'marker',
  'text',
  'region',
  'group',
]);

export const blendModeSchema = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
]);

export const mapBackgroundSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('solid'),
      color: colorSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('tiled-texture'),
      color: colorSchema,
      assetId: entityIdSchema,
      textureScale: z.number().finite().positive().max(1_024).optional(),
    })
    .strict(),
]);

export const gridSettingsSchema = z
  .object({
    enabled: z.boolean(),
    size: z.number().finite().positive().max(MAP_MAX_SIZE),
    snap: z.boolean(),
  })
  .strict();

export const cameraSettingsSchema = z
  .object({
    minZoom: z.number().finite().min(MIN_CAMERA_ZOOM).max(MAX_CAMERA_ZOOM),
    maxZoom: z.number().finite().min(MIN_CAMERA_ZOOM).max(MAX_CAMERA_ZOOM),
  })
  .strict()
  .refine((camera) => camera.minZoom <= camera.maxZoom, {
    message: 'Camera minZoom cannot exceed maxZoom.',
    path: ['minZoom'],
  });

export const mapSettingsSchema = z
  .object({
    chunkSize: chunkSizeSchema,
    worldUnit: z.enum(['unit', 'meter', 'kilometer', 'mile', 'custom']),
    customUnitLabel: z.string().trim().min(1).max(32).optional(),
    grid: gridSettingsSchema,
    camera: cameraSettingsSchema,
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.worldUnit === 'custom' && settings.customUnitLabel === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customUnitLabel'],
        message: 'customUnitLabel is required for a custom world unit.',
      });
    }

    if (settings.worldUnit !== 'custom' && settings.customUnitLabel !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customUnitLabel'],
        message: 'customUnitLabel is only valid for a custom world unit.',
      });
    }
  });

export const mapLayerSchema = z
  .object({
    id: entityIdSchema,
    mapId: entityIdSchema,
    parentId: entityIdSchema.nullable(),
    name: z.string().trim().min(1).max(120),
    type: mapLayerTypeSchema,
    order: z.number().int().safe().nonnegative(),
    visible: z.boolean(),
    locked: z.boolean(),
    opacity: z.number().finite().min(0).max(1),
    blendMode: blendModeSchema,
    createdAt: isoUtcDateTimeSchema,
    updatedAt: isoUtcDateTimeSchema,
  })
  .strict();

export const mapLayerInputSchema = mapLayerSchema
  .omit({
    mapId: true,
    createdAt: true,
    updatedAt: true,
  })
  .strict();

export const mapLayerCollectionSchema = z
  .array(mapLayerSchema)
  .max(5_000)
  .superRefine((layers, context) => {
    const layersById = new Map(layers.map((layer) => [layer.id, layer]));

    if (layersById.size !== layers.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Layer IDs must be unique.',
      });
    }

    if (layers.filter((layer) => layer.type === 'background').length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A map can contain at most one background layer.',
      });
    }

    layers.forEach((layer, index) => {
      if (layer.parentId === null) {
        return;
      }

      const parent = layersById.get(layer.parentId);

      if (!parent) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'parentId'],
          message: 'Layer parent must exist in the same document.',
        });
        return;
      }

      if (parent.mapId !== layer.mapId || parent.type !== 'group') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'parentId'],
          message: 'Layer parent must be a group in the same map.',
        });
      }

      const visited = new Set<string>([layer.id]);
      let ancestor = layersById.get(layer.parentId);

      while (ancestor) {
        if (visited.has(ancestor.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'parentId'],
            message: 'Layer hierarchy cannot contain a cycle.',
          });
          break;
        }

        visited.add(ancestor.id);
        ancestor = ancestor.parentId === null ? undefined : layersById.get(ancestor.parentId);
      }
    });

    const siblingOrders = new Map<string, number[]>();

    layers.forEach((layer) => {
      const key = `${layer.mapId}:${layer.parentId ?? 'root'}`;
      const orders = siblingOrders.get(key) ?? [];
      orders.push(layer.order);
      siblingOrders.set(key, orders);
    });

    siblingOrders.forEach((orders) => {
      const normalized = [...orders].sort((left, right) => left - right);
      const isContiguous = normalized.every((order, index) => order === index);

      if (!isContiguous) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Sibling layer order must be unique and contiguous from zero.',
        });
      }
    });
  });

export const mapDocumentSchema = z
  .object({
    schemaVersion: z.literal(MAP_MODEL_SCHEMA_VERSION),
    id: entityIdSchema,
    projectId: entityIdSchema,
    name: z.string().trim().min(1).max(120),
    width: z.number().finite().min(MAP_MIN_SIZE).max(MAP_MAX_SIZE),
    height: z.number().finite().min(MAP_MIN_SIZE).max(MAP_MAX_SIZE),
    themeId: z.string().trim().min(1).max(128),
    background: mapBackgroundSchema,
    layers: mapLayerCollectionSchema,
    settings: mapSettingsSchema,
    revision: z.number().int().safe().nonnegative(),
    createdAt: isoUtcDateTimeSchema,
    updatedAt: isoUtcDateTimeSchema,
  })
  .strict()
  .superRefine((document, context) => {
    document.layers.forEach((layer, index) => {
      if (layer.mapId !== document.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['layers', index, 'mapId'],
          message: 'Every layer must belong to its document map.',
        });
      }
    });
  });

export type MapLayerType = z.infer<typeof mapLayerTypeSchema>;
export type BlendMode = z.infer<typeof blendModeSchema>;
export type MapBackground = z.infer<typeof mapBackgroundSchema>;
export type MapSettings = z.infer<typeof mapSettingsSchema>;
export type MapLayer = z.infer<typeof mapLayerSchema>;
export type MapLayerInput = z.infer<typeof mapLayerInputSchema>;
export type MapDocument = z.infer<typeof mapDocumentSchema>;

export function assertValidLayerHierarchy(layers: readonly MapLayer[]): void {
  mapLayerCollectionSchema.parse(layers);
}
