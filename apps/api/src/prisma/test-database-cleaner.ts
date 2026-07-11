import { AppError } from '../common/errors/app-error.js';
import type { PrismaService } from './prisma.service.js';

export function assertSafeTestDatabaseUrl(databaseUrl: string): void {
  let databaseName: string;

  try {
    const url = new URL(databaseUrl);
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new AppError('UNSAFE_TEST_DATABASE', 'The test database URL is invalid.', 500);
  }

  if (!databaseName.endsWith('_test')) {
    throw new AppError(
      'UNSAFE_TEST_DATABASE',
      'Test cleanup requires a database name ending in _test.',
      500,
    );
  }
}

export async function cleanTestDatabase(prisma: PrismaService, databaseUrl: string): Promise<void> {
  assertSafeTestDatabaseUrl(databaseUrl);

  await prisma.$transaction([
    prisma.operationReceipt.deleteMany(),
    prisma.exportTask.deleteMany(),
    prisma.mapVersion.deleteMany(),
    prisma.location.deleteMany(),
    prisma.mapObject.deleteMany(),
    prisma.mapChunk.deleteMany(),
    prisma.mapLayer.deleteMany(),
    prisma.mapDocument.deleteMany(),
    prisma.map.deleteMany(),
    prisma.project.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.assetCategory.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
