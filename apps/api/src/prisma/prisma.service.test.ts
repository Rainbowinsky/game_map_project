import { describe, expect, it, vi } from 'vitest';

import { DatabaseUnavailableError } from '../common/errors/app-error.js';
import { createAppConfigFixture } from '../test/app-config.fixture.js';
import { PrismaService } from './prisma.service.js';
import { assertSafeTestDatabaseUrl } from './test-database-cleaner.js';

describe('PrismaService lifecycle', () => {
  it('connects and disconnects through Nest lifecycle hooks', async () => {
    const prisma = new PrismaService(createAppConfigFixture());
    const connect = vi.spyOn(prisma, '$connect').mockResolvedValue(undefined);
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue(undefined);

    await prisma.onModuleInit();
    await prisma.onModuleDestroy();

    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('turns driver failures into a safe startup error', async () => {
    const prisma = new PrismaService(createAppConfigFixture());
    vi.spyOn(prisma, '$connect').mockRejectedValue(
      new Error('mysql://root:top-secret@localhost:3306/maps failed'),
    );

    await expect(prisma.onModuleInit()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    await expect(prisma.onModuleInit()).rejects.not.toHaveProperty(
      'message',
      expect.stringContaining('root'),
    );
  });
});

describe('test database cleanup guard', () => {
  it('accepts only database names ending in _test', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('mysql://user:password@localhost:3306/fantasy_map_test'),
    ).not.toThrow();
    expect(() =>
      assertSafeTestDatabaseUrl('mysql://user:password@localhost:3306/fantasy_map'),
    ).toThrow(/ending in _test/);
  });
});
