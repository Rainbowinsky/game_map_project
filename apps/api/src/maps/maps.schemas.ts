import { z } from 'zod';
import {
  applyOperationsRequestSchema,
  mapLayerInputSchema,
  layerChangesSchema,
} from '@fantasy-map/map-model';

const revisionEnvelope = z.object({
  baseRevision: z.number().int().safe().nonnegative(),
  clientMutationId: z.string().uuid(),
});

export const mapIdParamSchema = z.object({ mapId: z.string().uuid() }).strict();
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
export const operationRequestSchema = applyOperationsRequestSchema;
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
