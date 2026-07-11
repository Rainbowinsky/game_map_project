import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const integerEnvironmentValue = (fallback: string, minimum: number, maximum: number) =>
  z
    .string()
    .default(fallback)
    .transform((value) => Number(value))
    .pipe(z.number().int().min(minimum).max(maximum));

const databaseUrlSchema = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    try {
      const url = new URL(value);

      if (url.protocol !== 'mysql:') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DATABASE_URL must use the mysql protocol.',
        });
      }

      if (!url.hostname || !url.pathname.slice(1)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DATABASE_URL must include a host and database name.',
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL must be a valid MySQL URL.',
      });
    }
  });

const environmentSchema = z
  .object({
    nodeEnv: z.enum(['development', 'test', 'production']),
    apiHost: z.string().trim().min(1).max(255),
    apiPort: z.number().int().min(1).max(65_535),
    databaseUrl: databaseUrlSchema,
    corsOrigins: z.array(z.string().url()).min(1).max(20),
    jwtSecret: z.string().min(32).max(512),
    storageRoot: z.string().trim().min(1).max(500),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
    requestBodyLimit: z.string().regex(/^\d+(?:kb|mb)$/i),
    rateLimit: z
      .object({
        ttlMs: z.number().int().min(1_000).max(3_600_000),
        limit: z.number().int().min(1).max(10_000),
      })
      .strict(),
  })
  .strict();

export type AppConfig = z.infer<typeof environmentSchema>;
export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export function loadAppConfig(environment: EnvironmentInput = process.env): AppConfig {
  const corsOrigins = (environment.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return environmentSchema.parse({
    nodeEnv: environment.NODE_ENV ?? 'development',
    apiHost: environment.API_HOST ?? '127.0.0.1',
    apiPort: integerEnvironmentValue('3000', 1, 65_535).parse(environment.API_PORT),
    databaseUrl: environment.DATABASE_URL,
    corsOrigins,
    jwtSecret: environment.JWT_SECRET,
    storageRoot: environment.STORAGE_ROOT ?? './apps/api/storage',
    logLevel: environment.LOG_LEVEL ?? 'info',
    requestBodyLimit: environment.REQUEST_BODY_LIMIT ?? '1mb',
    rateLimit: {
      ttlMs: integerEnvironmentValue('60000', 1_000, 3_600_000).parse(
        environment.RATE_LIMIT_TTL_MS,
      ),
      limit: integerEnvironmentValue('120', 1, 10_000).parse(environment.RATE_LIMIT_LIMIT),
    },
  });
}

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: loadAppConfig,
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
