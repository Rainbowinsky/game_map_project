import { resolve } from 'node:path';

import { config as loadEnvironmentFile } from 'dotenv';

loadEnvironmentFile({ path: resolve(process.cwd(), '../../.env.test'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.API_HOST ??= '127.0.0.1';
process.env.API_PORT ??= '3101';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.JWT_SECRET ??= 'ci-integration-secret-with-at-least-32-characters';
process.env.JWT_ISSUER ??= 'fantasy-map-api-test';
process.env.JWT_AUDIENCE ??= 'fantasy-map-web-test';
process.env.JWT_ACCESS_TTL_SECONDS ??= '900';
process.env.STORAGE_ROOT ??= './storage-test';
process.env.LOG_LEVEL ??= 'error';
process.env.REQUEST_BODY_LIMIT ??= '1mb';
process.env.RATE_LIMIT_TTL_MS ??= '60000';
process.env.RATE_LIMIT_LIMIT ??= '1000';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for API integration tests.');
}
