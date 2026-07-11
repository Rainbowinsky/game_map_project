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

  // Prisma's MariaDB adapter can exhaust its transaction-acquisition window
  // when array transactions are started during application bootstrap. This is
  // an isolated, name-guarded test database, so deterministic FK-order cleanup
  // is safer and more portable than an all-or-nothing cleanup transaction.
  await prisma.operationReceipt.deleteMany();
  await prisma.exportTask.deleteMany();
  await prisma.mapVersion.deleteMany();
  await prisma.location.deleteMany();
  await prisma.mapObject.deleteMany();
  await prisma.mapChunk.deleteMany();
  await prisma.mapLayer.deleteMany();
  await prisma.mapDocument.deleteMany();
  await prisma.map.deleteMany();
  await prisma.project.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.assetCategory.deleteMany();
  await prisma.user.deleteMany();
}
