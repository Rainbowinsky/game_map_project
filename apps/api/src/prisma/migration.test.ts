import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Prisma migrations', () => {
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

  it('adds P2 location-marker, asset audit and query-index contracts', async () => {
    const preflight = await readFile(
      resolve('prisma/migrations/20260712114900_p2_backfill_location_asset_refs/migration.sql'),
      'utf8',
    );
    const migration = await readFile(
      resolve('prisma/migrations/20260712115000_p2_contracts/migration.sql'),
      'utf8',
    );

    expect(migration).toContain('markerObjectId');
    expect(migration).toContain('Location_markerObjectId_fkey');
    expect(migration).toContain('Location_iconAssetId_fkey');
    expect(migration).toContain('originalFileName');
    expect(migration).toContain('deletedAt');
    expect(migration).toContain('Location_mapId_name_idx');
    expect(migration).toContain('Asset_ownerId_categoryId_createdAt_idx');
    expect(migration).not.toContain('DATABASE_URL');
    expect(preflight).toContain('LEFT JOIN `Asset`');
    expect(preflight).toContain('`iconAssetId` = NULL');
    expect(preflight).not.toContain('DELETE');
  });

  it('enforces P2-5 owner-scoped asset category names', async () => {
    const migration = await readFile(
      resolve(
        process.cwd(),
        'prisma/migrations/20260712160000_p25_asset_category_unique/migration.sql',
      ),
      'utf8',
    );
    expect(migration).not.toContain('DROP INDEX');
    expect(migration).toContain('AssetCategory_ownerId_name_key');
    expect(migration).toContain('(`ownerId`, `name`)');
  });
});
