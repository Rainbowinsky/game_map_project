import { z } from 'zod';

const nonEmptyName = z.string().trim().min(1).max(120);

export const createProjectRequestSchema = z
  .object({
    name: nonEmptyName,
    description: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict();

export const updateProjectRequestSchema = createProjectRequestSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Project changes cannot be empty.');

export const createMapRequestSchema = z
  .object({
    name: nonEmptyName,
    width: z.number().int().min(1_000).max(1_000_000),
    height: z.number().int().min(1_000).max(1_000_000),
    themeId: z.string().trim().min(1).max(128).default('mvp-classic'),
  })
  .strict();

export const paginationQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();

export const mapSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: nonEmptyName,
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: false }),
  })
  .strict();

export const projectResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: nonEmptyName,
    description: z.string().nullable(),
    createdAt: z.string().datetime({ offset: false }),
    updatedAt: z.string().datetime({ offset: false }),
    maps: z.array(mapSummarySchema),
  })
  .strict();

export const projectListResponseSchema = z
  .object({
    items: z.array(projectResponseSchema),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type CreateMapRequest = z.infer<typeof createMapRequestSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type MapSummary = z.infer<typeof mapSummarySchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
