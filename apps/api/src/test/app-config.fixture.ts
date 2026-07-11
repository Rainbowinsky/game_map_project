import type { AppConfig } from '../config/app-config.js';

export function createAppConfigFixture(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    apiHost: '127.0.0.1',
    apiPort: 3_100,
    databaseUrl: 'mysql://test_user:test_password@127.0.0.1:3306/fantasy_map_test',
    corsOrigins: ['http://localhost:5173'],
    jwtSecret: 'test-only-secret-with-at-least-32-characters',
    storageRoot: './storage-test',
    logLevel: 'debug',
    requestBodyLimit: '1mb',
    rateLimit: {
      ttlMs: 60_000,
      limit: 120,
    },
    ...overrides,
  };
}
