import { WORKSPACE_NAME } from '@fantasy-map/shared';
import { z } from 'zod';

export const healthResponseSchema = z
  .object({
    name: z.literal(WORKSPACE_NAME),
    status: z.literal('ok'),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from './auth.js';
