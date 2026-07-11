import { resolve } from 'node:path';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config as loadEnvironmentFile } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client.js';

loadEnvironmentFile({ path: resolve(process.cwd(), '../../.env'), quiet: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
});

try {
  const category = await prisma.assetCategory.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { name: 'Built-in stamps' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      ownerId: null,
      name: 'Built-in stamps',
    },
  });
  const assets = [
    {
      id: '20000000-0000-4000-8000-000000000001',
      displayName: '远峰',
      relativePath: 'builtin/stamps/mountain.svg',
      byteSize: 359n,
      sha256: 'b8b90c23561645b33399aeeb8ee7f0ad4c34f27af9e53f757ceca47f150f0416',
      metadata: { stampKind: 'mountain', source: 'builtin-original' },
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      displayName: '古杉',
      relativePath: 'builtin/stamps/tree.svg',
      byteSize: 401n,
      sha256: 'badea5415a266536633ba03b6b58016714731998644fb76e769fc55322b7144e',
      metadata: { stampKind: 'tree', source: 'builtin-original' },
    },
    {
      id: '20000000-0000-4000-8000-000000000003',
      displayName: '边镇',
      relativePath: 'builtin/stamps/town.svg',
      byteSize: 397n,
      sha256: 'beaa3dcd00ae787eb2804d97bbaf15511a45aaaeef2670d5ad89cf2521ecb2a5',
      metadata: { stampKind: 'town', source: 'builtin-original' },
    },
  ] as const;
  for (const asset of assets) {
    await prisma.asset.upsert({
      where: { id: asset.id },
      update: {
        categoryId: category.id,
        displayName: asset.displayName,
        relativePath: asset.relativePath,
        byteSize: asset.byteSize,
        sha256: asset.sha256,
        metadata: asset.metadata,
      },
      create: {
        ...asset,
        ownerId: null,
        categoryId: category.id,
        kind: 'STAMP',
        mimeType: 'image/svg+xml',
        extension: 'svg',
        width: 96,
        height: 96,
      },
    });
  }
} finally {
  await prisma.$disconnect();
}
