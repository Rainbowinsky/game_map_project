import { resolve } from 'node:path';

import { config as loadEnvironmentFile } from 'dotenv';
import { defineConfig } from 'prisma/config';

const fallbackDatabaseUrl = 'mysql://invalid:invalid@127.0.0.1:3306/fantasy_map';

loadEnvironmentFile({ path: resolve(process.cwd(), '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Generate/validate do not need a live database. Application startup validates the real value.
    url: process.env.DATABASE_URL ?? fallbackDatabaseUrl,
  },
});
