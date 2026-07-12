import { z } from 'zod';

const brushNameSchema = z.string().trim().min(1).max(60);
const brushColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toUpperCase());

export const brushIdParamSchema = z.object({ brushId: z.string().uuid() }).strict();
export const createBrushSchema = z
  .object({ name: brushNameSchema, color: brushColorSchema })
  .strict();
export const updateBrushSchema = z
  .object({ name: brushNameSchema.optional(), color: brushColorSchema.optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Brush changes cannot be empty.');

export type CreateBrush = z.infer<typeof createBrushSchema>;
export type UpdateBrush = z.infer<typeof updateBrushSchema>;
