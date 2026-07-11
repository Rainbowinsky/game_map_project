import { mapDocumentSchema, type MapDocument } from './document.js';
import { MAP_MODEL_SCHEMA_VERSION } from './primitives.js';

export type MapDocumentMigration = (input: unknown) => unknown;

export class UnsupportedMapDocumentVersionError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(`Unsupported map document schema version: ${version}.`);
    this.name = 'UnsupportedMapDocumentVersionError';
    this.version = version;
  }
}

const migrationRegistry = new Map<number, MapDocumentMigration>();

export const mapDocumentMigrationRegistry: ReadonlyMap<number, MapDocumentMigration> =
  migrationRegistry;

function parseVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new UnsupportedMapDocumentVersionError(version);
  }

  return version;
}

export function migrateMapDocument(
  input: unknown,
  fromVersionInput: number,
  toVersionInput: number = MAP_MODEL_SCHEMA_VERSION,
): MapDocument {
  const fromVersion = parseVersion(fromVersionInput);
  const toVersion = parseVersion(toVersionInput);

  if (fromVersion > MAP_MODEL_SCHEMA_VERSION) {
    throw new UnsupportedMapDocumentVersionError(fromVersion);
  }

  if (toVersion > MAP_MODEL_SCHEMA_VERSION || toVersion < fromVersion) {
    throw new UnsupportedMapDocumentVersionError(toVersion);
  }

  let migrated = input;

  for (let version = fromVersion; version < toVersion; version += 1) {
    const migration = migrationRegistry.get(version);

    if (!migration) {
      throw new UnsupportedMapDocumentVersionError(version);
    }

    migrated = migration(migrated);
  }

  return mapDocumentSchema.parse(migrated);
}
