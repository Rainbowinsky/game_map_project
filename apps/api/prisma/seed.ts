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
  await prisma.assetCategory.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { name: 'Built-in stamps' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      ownerId: null,
      name: 'Built-in stamps',
    },
  });
} finally {
  await prisma.$disconnect();
}
