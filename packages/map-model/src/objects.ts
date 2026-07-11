import { z } from 'zod';

import {
  chunkCoordinateSchema,
  colorSchema,
  entityIdSchema,
  isoUtcDateTimeSchema,
  objectTransformSchema,
} from './primitives.js';

export const MAX_METADATA_BYTES = 16 * 1_024;

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

function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
      index += 1;
    }
  }

  return bytes;
}

export const metadataSchema = z.record(jsonValueSchema).superRefine((metadata, context) => {
  if (utf8ByteLength(JSON.stringify(metadata)) > MAX_METADATA_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Metadata cannot exceed ${MAX_METADATA_BYTES} UTF-8 bytes.`,
    });
  }
});

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

export const stampMapObjectSchema = z
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

export const mapObjectSchema = z.discriminatedUnion('type', [stampMapObjectSchema]);

export const stampMapObjectInputSchema = stampMapObjectSchema
  .omit({
    mapId: true,
    chunk: true,
    revision: true,
    createdAt: true,
    updatedAt: true,
  })
  .strict();

export type StampKind = z.infer<typeof stampKindSchema>;
export type StampMapObject = z.infer<typeof stampMapObjectSchema>;
export type StampMapObjectInput = z.infer<typeof stampMapObjectInputSchema>;
export type MapObject = z.infer<typeof mapObjectSchema>;
