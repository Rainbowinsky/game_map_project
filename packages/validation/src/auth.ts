import { z } from 'zod';

export const normalizedEmailSchema = z.string().trim().toLowerCase().email().max(191);
export const passwordSchema = z.string().min(12).max(128);
export const displayNameSchema = z.string().trim().min(2).max(100);

export const registerRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
  })
  .strict();

export const publicUserSchema = z
  .object({
    id: z.string().uuid(),
    email: normalizedEmailSchema,
    displayName: displayNameSchema,
    createdAt: z.string().datetime({ offset: false }),
    updatedAt: z.string().datetime({ offset: false }),
  })
  .strict();

export const authResponseSchema = z
  .object({
    user: publicUserSchema,
    accessToken: z.string().min(32),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int().positive(),
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
