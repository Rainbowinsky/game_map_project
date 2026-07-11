import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('initial Prisma migration', () => {
  it('creates the P2 tables, constraints and utf8mb4 collation', async () => {
    const migration = await readFile(
      resolve('prisma/migrations/20260711194000_initial/migration.sql'),
      'utf8',
    );

    for (const table of [
      'User',
      'Project',
      'Map',
      'MapDocument',
      'MapLayer',
      'MapChunk',
      'MapObject',
      'OperationReceipt',
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }

    expect(migration).toContain('utf8mb4_unicode_ci');
    expect(migration).toContain('FOREIGN KEY');
    expect(migration).not.toContain('DATABASE_URL');
  });
});
