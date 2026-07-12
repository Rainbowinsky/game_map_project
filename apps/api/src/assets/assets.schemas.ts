import { z } from 'zod';

const idSchema = z.string().uuid();
export const assetKindSchema = z.enum(['STAMP', 'TEXTURE', 'IMAGE']);
export const assetIdParamSchema = z.object({ assetId: idSchema }).strict();
export const categoryIdParamSchema = z.object({ categoryId: idSchema }).strict();

export const assetListQuerySchema = z
  .object({
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    kind: assetKindSchema.optional(),
    categoryId: idSchema.optional(),
  })
  .strict();

export const assetUploadFieldsSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    kind: assetKindSchema,
    categoryId: idSchema.optional(),
  })
  .strict();

const safeMetadataSchema = z
  .record(z.string().trim().max(500))
  .refine((value) => Object.keys(value).length <= 20, 'Metadata cannot have more than 20 fields.');

export const updateAssetSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    categoryId: idSchema.nullable().optional(),
    metadata: safeMetadataSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Asset changes cannot be empty.');

export const createAssetCategorySchema = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
export const updateAssetCategorySchema = createAssetCategorySchema;

export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type AssetUploadFields = z.infer<typeof assetUploadFieldsSchema>;
export type UpdateAsset = z.infer<typeof updateAssetSchema>;
export type CreateAssetCategory = z.infer<typeof createAssetCategorySchema>;
