import { z } from 'zod';
import {
  mapLayerInputSchema,
  layerChangesSchema,
  mapOperationSchema,
} from '@fantasy-map/map-model';

const revisionEnvelope = z.object({
  baseRevision: z.number().int().safe().nonnegative(),
  clientMutationId: z.string().uuid(),
});

export const mapIdParamSchema = z.object({ mapId: z.string().uuid() }).strict();
export const locationQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    type: z.string().trim().max(50).optional(),
    tag: z.string().trim().max(48).optional(),
  })
  .strict();
export const projectIdParamSchema = z.object({ projectId: z.string().uuid() }).strict();
export const layerIdParamSchema = z
  .object({ mapId: z.string().uuid(), layerId: z.string().uuid() })
  .strict();
export const chunkParamSchema = z
  .object({
    mapId: z.string().uuid(),
    x: z.coerce.number().int().safe(),
    y: z.coerce.number().int().safe(),
  })
  .strict();
/**
 * Keep the version envelope parseable so the controller can return a precise
 * compatibility error for legacy clients instead of a generic Zod literal
 * failure. The operation body remains the shared strict contract.
 */
export const operationRequestSchema = z
  .object({
    schemaVersion: z.number().int().safe().positive(),
    baseRevision: z.number().int().safe().nonnegative(),
    clientMutationId: z.string().uuid(),
    operations: z.array(mapOperationSchema).min(1).max(500),
  })
  .strict();
export const createLayerRequestSchema = revisionEnvelope
  .extend({ layer: mapLayerInputSchema })
  .strict();
export const updateLayerRequestSchema = revisionEnvelope
  .extend({ changes: layerChangesSchema })
  .strict();
export const reorderLayersRequestSchema = revisionEnvelope
  .extend({
    parentId: z.string().uuid().nullable(),
    orderedLayerIds: z.array(z.string().uuid()).min(1).max(5_000),
  })
  .strict();
export const deleteLayerRequestSchema = revisionEnvelope
  .extend({
    objectPolicy: z.enum(['delete', 'move']),
    targetLayerId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.objectPolicy === 'move' && !input.targetLayerId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetLayerId'],
        message: 'targetLayerId is required when moving objects.',
      });
    }
  });

export type CreateLayerRequest = z.infer<typeof createLayerRequestSchema>;
export type UpdateLayerRequest = z.infer<typeof updateLayerRequestSchema>;
export type ReorderLayersRequest = z.infer<typeof reorderLayersRequestSchema>;
export type DeleteLayerRequest = z.infer<typeof deleteLayerRequestSchema>;
export type OperationRequestEnvelope = z.infer<typeof operationRequestSchema>;
export type LocationQuery = z.infer<typeof locationQuerySchema>;
