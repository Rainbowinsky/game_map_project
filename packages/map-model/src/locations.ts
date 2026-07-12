import { z } from 'zod';

import { metadataSchema } from './objects.js';
import { entityIdSchema, isoUtcDateTimeSchema, worldCoordinateSchema } from './primitives.js';

export const locationTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z][a-z0-9-]*$/, 'Expected a lowercase location type.');

export const locationTagsSchema = z
  .array(z.string().trim().min(1).max(48))
  .max(50)
  .superRefine((tags, context) => {
    if (new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== tags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Location tags must be unique ignoring case.',
      });
    }
  });

const optionalZoomSchema = z.number().finite().positive().max(1_024).nullable();

const locationBaseSchema = z
  .object({
    id: entityIdSchema,
    mapId: entityIdSchema,
    name: z.string().trim().min(1).max(120),
    type: locationTypeSchema,
    x: worldCoordinateSchema,
    y: worldCoordinateSchema,
    summary: z.string().trim().max(2_000).nullable(),
    description: z.string().trim().max(20_000).nullable(),
    regionId: entityIdSchema.nullable(),
    iconAssetId: entityIdSchema.nullable(),
    markerObjectId: entityIdSchema.nullable(),
    tags: locationTagsSchema,
    customFields: metadataSchema,
    minZoom: optionalZoomSchema,
    maxZoom: optionalZoomSchema,
    createdAt: isoUtcDateTimeSchema,
    updatedAt: isoUtcDateTimeSchema,
  })
  .strict();

function validateLocationZoom(
  location: Pick<z.infer<typeof locationBaseSchema>, 'minZoom' | 'maxZoom'>,
  context: z.RefinementCtx,
): void {
  if (
    location.minZoom !== null &&
    location.maxZoom !== null &&
    location.minZoom > location.maxZoom
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minZoom'],
      message: 'Location minZoom cannot exceed maxZoom.',
    });
  }
}

export const locationSchema = locationBaseSchema.superRefine(validateLocationZoom);

export const locationInputSchema = locationBaseSchema
  .omit({ mapId: true, markerObjectId: true, createdAt: true, updatedAt: true })
  .strict()
  .superRefine(validateLocationZoom);

export const locationChangesSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    type: locationTypeSchema.optional(),
    x: worldCoordinateSchema.optional(),
    y: worldCoordinateSchema.optional(),
    summary: z.string().trim().max(2_000).nullable().optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    regionId: entityIdSchema.nullable().optional(),
    iconAssetId: entityIdSchema.nullable().optional(),
    tags: locationTagsSchema.optional(),
    customFields: metadataSchema.optional(),
    minZoom: optionalZoomSchema.optional(),
    maxZoom: optionalZoomSchema.optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'Location changes cannot be empty.',
  })
  .superRefine((changes, context) => {
    if (
      changes.minZoom !== undefined &&
      changes.maxZoom !== undefined &&
      changes.minZoom !== null &&
      changes.maxZoom !== null &&
      changes.minZoom > changes.maxZoom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minZoom'],
        message: 'Location minZoom cannot exceed maxZoom.',
      });
    }
  });

export type Location = z.infer<typeof locationSchema>;
export type LocationInput = z.infer<typeof locationInputSchema>;
export type LocationChanges = z.infer<typeof locationChangesSchema>;
