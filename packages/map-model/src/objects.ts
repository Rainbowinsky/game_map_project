import { z } from 'zod';

import {
  chunkCoordinateSchema,
  colorSchema,
  entityIdSchema,
  isoUtcDateTimeSchema,
  objectTransformSchema,
  worldPointSchema,
} from './primitives.js';

export const MAX_METADATA_BYTES = 16 * 1_024;
export const MAX_OBJECT_PAYLOAD_BYTES = 256 * 1_024;
export const MAX_TERRAIN_STROKE_POINTS = 20_000;
export const MAX_PATH_NODES = 10_000;
export const MAX_REGION_VERTICES = 10_000;
export const MAX_TERRAIN_STROKE_LENGTH = 50_000_000;

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

export function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else {
      bytes += 4;
      index += 1;
    }
  }

  return bytes;
}

export function hasByteLimit(value: unknown, limit: number): boolean {
  return utf8ByteLength(JSON.stringify(value)) <= limit;
}

export const metadataSchema = z.record(jsonValueSchema).superRefine((metadata, context) => {
  if (!hasByteLimit(metadata, MAX_METADATA_BYTES)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Metadata cannot exceed ${MAX_METADATA_BYTES} UTF-8 bytes.`,
    });
  }
});

export const tokenIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9.-]{0,63}$/, 'Expected a lowercase token identifier.');

const mapObjectBaseShape = {
  id: entityIdSchema,
  mapId: entityIdSchema,
  layerId: entityIdSchema,
  chunk: chunkCoordinateSchema,
  name: z.string().trim().min(1).max(120).nullable(),
  zIndex: z.number().int().safe(),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().finite().min(0).max(1),
  metadata: metadataSchema,
  revision: z.number().int().safe().nonnegative(),
  createdAt: isoUtcDateTimeSchema,
  updatedAt: isoUtcDateTimeSchema,
} as const;

export const stampKindSchema = z.enum(['mountain', 'tree', 'town']);
export const terrainKindSchema = z.enum(['water', 'forest', 'mountain', 'desert', 'grassland']);
export const pathKindSchema = z.enum(['road', 'river']);
export const textAlignSchema = z.enum(['left', 'center', 'right']);

export const terrainBrushSchema = z
  .object({
    radius: z.number().finite().positive().max(20_000),
    opacity: z.number().finite().min(0.01).max(1),
    spacing: z.number().finite().positive().max(20_000),
    hardness: z.number().finite().min(0).max(1),
  })
  .strict();

export const terrainStrokePointSchema = worldPointSchema
  .extend({ pressure: z.number().finite().min(0).max(1).optional() })
  .strict();

export const pathNodeSchema = z
  .object({
    anchor: worldPointSchema,
    handleIn: worldPointSchema.optional(),
    handleOut: worldPointSchema.optional(),
  })
  .strict();

const baseObjectOmit = {
  mapId: true,
  chunk: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
} as const;

const stampMapObjectBaseSchema = z
  .object({
    ...objectTransformSchema.shape,
    ...mapObjectBaseShape,
    type: z.literal('stamp'),
    assetId: entityIdSchema,
    stampKind: stampKindSchema,
    tint: colorSchema.nullable(),
    flipX: z.boolean(),
    flipY: z.boolean(),
    randomSeed: z.number().int().min(0).max(4_294_967_295),
  })
  .strict();

const terrainStrokeMapObjectBaseSchema = z
  .object({
    ...objectTransformSchema.shape,
    ...mapObjectBaseShape,
    type: z.literal('terrain-stroke'),
    terrainKind: terrainKindSchema,
    brush: terrainBrushSchema,
    points: z.array(terrainStrokePointSchema).min(2).max(MAX_TERRAIN_STROKE_POINTS),
    randomSeed: z.number().int().min(0).max(4_294_967_295),
    styleToken: tokenIdentifierSchema,
  })
  .strict();

const regionMapObjectBaseSchema = z
  .object({
    ...objectTransformSchema.shape,
    ...mapObjectBaseShape,
    type: z.literal('region'),
    vertices: z.array(worldPointSchema).min(3).max(MAX_REGION_VERTICES),
    fillToken: tokenIdentifierSchema,
    strokeToken: tokenIdentifierSchema,
    strokeWidth: z.number().finite().positive().max(10_000),
  })
  .strict();

const pathMapObjectBaseSchema = z
  .object({
    ...objectTransformSchema.shape,
    ...mapObjectBaseShape,
    type: z.literal('path'),
    pathKind: pathKindSchema,
    nodes: z.array(pathNodeSchema).min(2).max(MAX_PATH_NODES),
    styleToken: tokenIdentifierSchema,
    widthStart: z.number().finite().positive().max(10_000),
    widthEnd: z.number().finite().positive().max(10_000),
  })
  .strict();

const textMapObjectBaseSchema = z
  .object({
    ...objectTransformSchema.shape,
    ...mapObjectBaseShape,
    type: z.literal('text'),
    text: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .refine((value) => !/[<>]/.test(value), 'Text must not contain HTML markup.')
      .refine((value) => value.split('\n').length <= 20, 'Text cannot exceed 20 lines.'),
    fontSize: z.number().finite().min(4).max(512),
    align: textAlignSchema,
    fontToken: tokenIdentifierSchema,
    colorToken: tokenIdentifierSchema,
  })
  .strict();

const markerMapObjectBaseSchema = z
  .object({
    ...objectTransformSchema.shape,
    ...mapObjectBaseShape,
    type: z.literal('marker'),
    locationId: entityIdSchema,
    iconAssetId: entityIdSchema.nullable(),
    minZoom: z.number().finite().positive().max(1_024).nullable(),
    maxZoom: z.number().finite().positive().max(1_024).nullable(),
  })
  .strict();

function pointDistance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function orientation(
  first: { x: number; y: number },
  second: { x: number; y: number },
  third: { x: number; y: number },
): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function onSegment(
  first: { x: number; y: number },
  second: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  const epsilon = 1e-9;
  return (
    Math.abs(orientation(first, second, point)) <= epsilon &&
    point.x >= Math.min(first.x, second.x) - epsilon &&
    point.x <= Math.max(first.x, second.x) + epsilon &&
    point.y >= Math.min(first.y, second.y) - epsilon &&
    point.y <= Math.max(first.y, second.y) + epsilon
  );
}

function segmentsIntersect(
  firstStart: { x: number; y: number },
  firstEnd: { x: number; y: number },
  secondStart: { x: number; y: number },
  secondEnd: { x: number; y: number },
): boolean {
  const epsilon = 1e-9;
  const first = orientation(firstStart, firstEnd, secondStart);
  const second = orientation(firstStart, firstEnd, secondEnd);
  const third = orientation(secondStart, secondEnd, firstStart);
  const fourth = orientation(secondStart, secondEnd, firstEnd);
  if (
    ((first > epsilon && second < -epsilon) || (first < -epsilon && second > epsilon)) &&
    ((third > epsilon && fourth < -epsilon) || (third < -epsilon && fourth > epsilon))
  )
    return true;
  return (
    onSegment(firstStart, firstEnd, secondStart) ||
    onSegment(firstStart, firstEnd, secondEnd) ||
    onSegment(secondStart, secondEnd, firstStart) ||
    onSegment(secondStart, secondEnd, firstEnd)
  );
}

function validateTerrainStroke(
  object: Pick<z.infer<typeof terrainStrokeMapObjectBaseSchema>, 'brush' | 'points'>,
  context: z.RefinementCtx,
): void {
  const length = object.points
    .slice(1)
    .reduce((total, point, index) => total + pointDistance(object.points[index]!, point), 0);
  if (length <= 0 || length > MAX_TERRAIN_STROKE_LENGTH) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['points'],
      message: `Terrain stroke length must be in (0, ${MAX_TERRAIN_STROKE_LENGTH}].`,
    });
  }
  if (!hasByteLimit({ brush: object.brush, points: object.points }, MAX_OBJECT_PAYLOAD_BYTES)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['points'],
      message: `Terrain payload cannot exceed ${MAX_OBJECT_PAYLOAD_BYTES} UTF-8 bytes.`,
    });
  }
}

function validateRegion(
  object: Pick<z.infer<typeof regionMapObjectBaseSchema>, 'vertices'>,
  context: z.RefinementCtx,
): void {
  const { vertices } = object;
  const distinct = new Set(vertices.map((point) => `${point.x}:${point.y}`));
  const twiceArea = vertices.reduce((total, point, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    return total + point.x * next.y - next.x * point.y;
  }, 0);
  if (distinct.size !== vertices.length || Math.abs(twiceArea) <= 1e-9) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vertices'],
      message: 'A region needs at least three distinct, non-collinear vertices.',
    });
  }
  for (let index = 0; index < vertices.length; index += 1) {
    const firstStart = vertices[index]!;
    const firstEnd = vertices[(index + 1) % vertices.length]!;
    for (let candidate = index + 1; candidate < vertices.length; candidate += 1) {
      if (candidate === index + 1 || (index === 0 && candidate === vertices.length - 1)) continue;
      const secondStart = vertices[candidate]!;
      const secondEnd = vertices[(candidate + 1) % vertices.length]!;
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vertices'],
          message: 'Region polygons cannot self-intersect.',
        });
        return;
      }
    }
  }
  if (!hasByteLimit({ vertices }, MAX_OBJECT_PAYLOAD_BYTES)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vertices'],
      message: `Region payload cannot exceed ${MAX_OBJECT_PAYLOAD_BYTES} UTF-8 bytes.`,
    });
  }
}

function validatePath(
  object: Pick<z.infer<typeof pathMapObjectBaseSchema>, 'nodes'>,
  context: z.RefinementCtx,
): void {
  if (
    object.nodes.every(
      (node, index) =>
        index === 0 || pointDistance(object.nodes[index - 1]!.anchor, node.anchor) === 0,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nodes'],
      message: 'A path needs at least two distinct anchors.',
    });
  }
  if (!hasByteLimit({ nodes: object.nodes }, MAX_OBJECT_PAYLOAD_BYTES)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nodes'],
      message: `Path payload cannot exceed ${MAX_OBJECT_PAYLOAD_BYTES} UTF-8 bytes.`,
    });
  }
}

function validateMarker(
  object: Pick<z.infer<typeof markerMapObjectBaseSchema>, 'minZoom' | 'maxZoom'>,
  context: z.RefinementCtx,
): void {
  if (object.minZoom !== null && object.maxZoom !== null && object.minZoom > object.maxZoom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minZoom'],
      message: 'Marker minZoom cannot exceed maxZoom.',
    });
  }
}

function validateMapObject(value: MapObjectBase, context: z.RefinementCtx): void {
  switch (value.type) {
    case 'terrain-stroke':
      validateTerrainStroke(value, context);
      return;
    case 'region':
      validateRegion(value, context);
      return;
    case 'path':
      validatePath(value, context);
      return;
    case 'marker':
      validateMarker(value, context);
      return;
    case 'stamp':
    case 'text':
      return;
  }
}

type MapObjectBase =
  | z.infer<typeof stampMapObjectBaseSchema>
  | z.infer<typeof terrainStrokeMapObjectBaseSchema>
  | z.infer<typeof regionMapObjectBaseSchema>
  | z.infer<typeof pathMapObjectBaseSchema>
  | z.infer<typeof textMapObjectBaseSchema>
  | z.infer<typeof markerMapObjectBaseSchema>;

export const stampMapObjectSchema = stampMapObjectBaseSchema;
export const terrainStrokeMapObjectSchema =
  terrainStrokeMapObjectBaseSchema.superRefine(validateTerrainStroke);
export const regionMapObjectSchema = regionMapObjectBaseSchema.superRefine(validateRegion);
export const pathMapObjectSchema = pathMapObjectBaseSchema.superRefine(validatePath);
export const textMapObjectSchema = textMapObjectBaseSchema;
export const markerMapObjectSchema = markerMapObjectBaseSchema.superRefine(validateMarker);

export const mapObjectSchema = z
  .discriminatedUnion('type', [
    stampMapObjectBaseSchema,
    terrainStrokeMapObjectBaseSchema,
    regionMapObjectBaseSchema,
    pathMapObjectBaseSchema,
    textMapObjectBaseSchema,
    markerMapObjectBaseSchema,
  ])
  .superRefine(validateMapObject);

const stampMapObjectInputBaseSchema = stampMapObjectBaseSchema.omit(baseObjectOmit).strict();
const terrainStrokeMapObjectInputBaseSchema = terrainStrokeMapObjectBaseSchema
  .omit(baseObjectOmit)
  .strict();
const regionMapObjectInputBaseSchema = regionMapObjectBaseSchema.omit(baseObjectOmit).strict();
const pathMapObjectInputBaseSchema = pathMapObjectBaseSchema.omit(baseObjectOmit).strict();
const textMapObjectInputBaseSchema = textMapObjectBaseSchema.omit(baseObjectOmit).strict();
const markerMapObjectInputBaseSchema = markerMapObjectBaseSchema.omit(baseObjectOmit).strict();

export const stampMapObjectInputSchema = stampMapObjectInputBaseSchema;
export const terrainStrokeMapObjectInputSchema = terrainStrokeMapObjectInputBaseSchema
  .strict()
  .superRefine(validateTerrainStroke);
export const regionMapObjectInputSchema =
  regionMapObjectInputBaseSchema.superRefine(validateRegion);
export const pathMapObjectInputSchema = pathMapObjectInputBaseSchema.superRefine(validatePath);
export const textMapObjectInputSchema = textMapObjectInputBaseSchema;
export const markerMapObjectInputSchema =
  markerMapObjectInputBaseSchema.superRefine(validateMarker);

export const mapObjectInputSchema = z
  .discriminatedUnion('type', [
    stampMapObjectInputBaseSchema,
    terrainStrokeMapObjectInputBaseSchema,
    regionMapObjectInputBaseSchema,
    pathMapObjectInputBaseSchema,
    textMapObjectInputBaseSchema,
    markerMapObjectInputBaseSchema,
  ])
  .superRefine((value, context) => validateMapObject(value as MapObjectBase, context));

export type StampKind = z.infer<typeof stampKindSchema>;
export type TerrainKind = z.infer<typeof terrainKindSchema>;
export type PathKind = z.infer<typeof pathKindSchema>;
export type TerrainBrush = z.infer<typeof terrainBrushSchema>;
export type TerrainStrokePoint = z.infer<typeof terrainStrokePointSchema>;
export type PathNode = z.infer<typeof pathNodeSchema>;
export type StampMapObject = z.infer<typeof stampMapObjectSchema>;
export type TerrainStrokeMapObject = z.infer<typeof terrainStrokeMapObjectSchema>;
export type RegionMapObject = z.infer<typeof regionMapObjectSchema>;
export type PathMapObject = z.infer<typeof pathMapObjectSchema>;
export type TextMapObject = z.infer<typeof textMapObjectSchema>;
export type MarkerMapObject = z.infer<typeof markerMapObjectSchema>;
export type MapObject = z.infer<typeof mapObjectSchema>;
export type StampMapObjectInput = z.infer<typeof stampMapObjectInputSchema>;
export type TerrainStrokeMapObjectInput = z.infer<typeof terrainStrokeMapObjectInputSchema>;
export type RegionMapObjectInput = z.infer<typeof regionMapObjectInputSchema>;
export type PathMapObjectInput = z.infer<typeof pathMapObjectInputSchema>;
export type TextMapObjectInput = z.infer<typeof textMapObjectInputSchema>;
export type MarkerMapObjectInput = z.infer<typeof markerMapObjectInputSchema>;
export type MapObjectInput = z.infer<typeof mapObjectInputSchema>;

export function isStampMapObject(object: MapObject): object is StampMapObject {
  return object.type === 'stamp';
}
