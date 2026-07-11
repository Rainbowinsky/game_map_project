import type { Brand } from '@fantasy-map/shared';
import { z } from 'zod';

export const MAP_MODEL_SCHEMA_VERSION = 1 as const;
export const MAX_ABS_WORLD_COORDINATE = 1_000_000_000;
export const MAX_WORLD_EXTENT = 2_000_000_000;
export const MIN_OBJECT_SCALE = 0.001;
export const MAX_OBJECT_SCALE = 1_024;
export const MIN_CAMERA_ZOOM = 0.000_001;
export const MAX_CAMERA_ZOOM = 1_024;

export type WorldUnit = Brand<number, 'WorldUnit'>;

const finiteNumberSchema = z.number().finite();

export const entityIdSchema = z.string().uuid();
export const isoUtcDateTimeSchema = z.string().datetime({ offset: false });
export const colorSchema = z.string().regex(/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/, {
  message: 'Expected a normalized #RRGGBB or #RRGGBBAA color.',
});

export const worldCoordinateSchema = finiteNumberSchema
  .min(-MAX_ABS_WORLD_COORDINATE)
  .max(MAX_ABS_WORLD_COORDINATE);

export const worldPointSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
  })
  .strict();

export const screenPointSchema = z
  .object({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
  })
  .strict();

export const worldRectSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    width: finiteNumberSchema.positive().max(MAX_WORLD_EXTENT),
    height: finiteNumberSchema.positive().max(MAX_WORLD_EXTENT),
  })
  .strict();

export const viewportSchema = z
  .object({
    width: finiteNumberSchema.positive().max(100_000),
    height: finiteNumberSchema.positive().max(100_000),
  })
  .strict();

export const cameraStateSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    zoom: finiteNumberSchema.min(MIN_CAMERA_ZOOM).max(MAX_CAMERA_ZOOM),
  })
  .strict();

export const chunkCoordinateSchema = z
  .object({
    x: z.number().int().safe(),
    y: z.number().int().safe(),
  })
  .strict();

export const objectTransformSchema = z
  .object({
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    rotation: finiteNumberSchema.min(-1_000_000).max(1_000_000),
    scaleX: finiteNumberSchema.min(MIN_OBJECT_SCALE).max(MAX_OBJECT_SCALE),
    scaleY: finiteNumberSchema.min(MIN_OBJECT_SCALE).max(MAX_OBJECT_SCALE),
  })
  .strict();

export type EntityId = z.infer<typeof entityIdSchema>;
export type WorldPoint = z.infer<typeof worldPointSchema>;
export type ScreenPoint = z.infer<typeof screenPointSchema>;
export type WorldRect = z.infer<typeof worldRectSchema>;
export type Viewport = z.infer<typeof viewportSchema>;
export type CameraState = z.infer<typeof cameraStateSchema>;
export type ChunkCoordinate = z.infer<typeof chunkCoordinateSchema>;
export type ObjectTransform = z.infer<typeof objectTransformSchema>;

export function worldUnit(value: number): WorldUnit {
  return worldCoordinateSchema.parse(value) as WorldUnit;
}
