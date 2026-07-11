import { describe, expect, it } from 'vitest';

import { loadAppConfig } from './app-config.js';

const validEnvironment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '3100',
  DATABASE_URL: 'mysql://user:password@127.0.0.1:3306/fantasy_map_test',
  CORS_ORIGINS: 'http://localhost:5173,https://maps.example.test',
  JWT_SECRET: 'a-test-secret-that-is-longer-than-thirty-two-characters',
  STORAGE_ROOT: './storage-test',
  LOG_LEVEL: 'warn',
  REQUEST_BODY_LIMIT: '2mb',
  RATE_LIMIT_TTL_MS: '30000',
  RATE_LIMIT_LIMIT: '50',
} as const;

describe('loadAppConfig', () => {
  it('parses and normalizes runtime configuration', () => {
    const config = loadAppConfig(validEnvironment);

    expect(config.apiPort).toBe(3_100);
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://maps.example.test']);
    expect(config.rateLimit).toEqual({ ttlMs: 30_000, limit: 50 });
    expect(config).toMatchObject({
      jwtIssuer: 'fantasy-map-api',
      jwtAudience: 'fantasy-map-web',
      jwtAccessTtlSeconds: 900,
    });
  });

  it('fails clearly when required secrets or database configuration are missing', () => {
    expect(() => loadAppConfig({ ...validEnvironment, DATABASE_URL: undefined })).toThrow();
    expect(() => loadAppConfig({ ...validEnvironment, JWT_SECRET: 'short' })).toThrow();
  });

  it('rejects non-MySQL and malformed database URLs', () => {
    expect(() =>
      loadAppConfig({ ...validEnvironment, DATABASE_URL: 'postgresql://localhost/maps' }),
    ).toThrow(/mysql/i);
    expect(() => loadAppConfig({ ...validEnvironment, DATABASE_URL: 'not-a-url' })).toThrow();
  });
});
