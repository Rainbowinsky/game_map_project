import { z } from 'zod';

import { colorSchema, entityIdSchema } from './primitives.js';

export const blendModeWhitelistSchema = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
]);

export const themeTokensSchema = z
  .object({
    ocean: colorSchema,
    land: colorSchema,
    coast: colorSchema,
    grid: colorSchema,
    selection: colorSchema,
    road: colorSchema,
    river: colorSchema,
    regionFill: colorSchema,
    regionStroke: colorSchema,
    text: colorSchema,
    defaultFontFamily: z.string().trim().min(1).max(160),
    textureAssetId: entityIdSchema.nullable(),
    markerIconAssetId: entityIdSchema.nullable(),
    allowedBlendModes: z.array(blendModeWhitelistSchema).min(1).max(6),
  })
  .strict()
  .superRefine((tokens, context) => {
    if (new Set(tokens.allowedBlendModes).size !== tokens.allowedBlendModes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedBlendModes'],
        message: 'Theme blend modes must be unique.',
      });
    }
  });

export const themeDefinitionSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,99}$/),
    displayName: z.string().trim().min(1).max(120),
    tokens: themeTokensSchema,
  })
  .strict();

export type ThemeTokens = z.infer<typeof themeTokensSchema>;
export type ThemeDefinition = z.infer<typeof themeDefinitionSchema>;
