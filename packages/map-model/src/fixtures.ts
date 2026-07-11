import { mapDocumentSchema, type MapDocument } from './document.js';
import { mapChunkPayloadSchema, type MapChunkPayload } from './chunks.js';
import { stampMapObjectSchema, type StampMapObject } from './objects.js';
import { applyOperationsRequestSchema, type ApplyOperationsRequest } from './operations.js';

export const FIXTURE_IDS = {
  project: '10000000-0000-4000-8000-000000000001',
  map: '10000000-0000-4000-8000-000000000002',
  backgroundLayer: '10000000-0000-4000-8000-000000000003',
  stampLayer: '10000000-0000-4000-8000-000000000004',
  object: '10000000-0000-4000-8000-000000000005',
  asset: '10000000-0000-4000-8000-000000000006',
  chunk: '10000000-0000-4000-8000-000000000007',
  mutation: '10000000-0000-4000-8000-000000000008',
} as const;

export const FIXTURE_TIMESTAMP = '2026-07-11T10:00:00.000Z';

export function createMapDocumentFixture(): MapDocument {
  return mapDocumentSchema.parse({
    schemaVersion: 1,
    id: FIXTURE_IDS.map,
    projectId: FIXTURE_IDS.project,
    name: 'The Known World',
    width: 100_000,
    height: 80_000,
    themeId: 'mvp-classic',
    background: {
      kind: 'solid',
      color: '#17324D',
    },
    layers: [
      {
        id: FIXTURE_IDS.backgroundLayer,
        mapId: FIXTURE_IDS.map,
        parentId: null,
        name: 'Ocean',
        type: 'background',
        order: 0,
        visible: true,
        locked: true,
        opacity: 1,
        blendMode: 'normal',
        createdAt: FIXTURE_TIMESTAMP,
        updatedAt: FIXTURE_TIMESTAMP,
      },
      {
        id: FIXTURE_IDS.stampLayer,
        mapId: FIXTURE_IDS.map,
        parentId: null,
        name: 'Landmarks',
        type: 'stamp',
        order: 1,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        createdAt: FIXTURE_TIMESTAMP,
        updatedAt: FIXTURE_TIMESTAMP,
      },
    ],
    settings: {
      chunkSize: 1_024,
      worldUnit: 'kilometer',
      grid: {
        enabled: true,
        size: 100,
        snap: false,
      },
      camera: {
        minZoom: 0.02,
        maxZoom: 16,
      },
    },
    revision: 3,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  });
}

export function createStampMapObjectFixture(): StampMapObject {
  return stampMapObjectSchema.parse({
    id: FIXTURE_IDS.object,
    mapId: FIXTURE_IDS.map,
    layerId: FIXTURE_IDS.stampLayer,
    chunk: { x: 1, y: -1 },
    type: 'stamp',
    name: 'Northwatch',
    x: 1_536,
    y: -1,
    rotation: Math.PI / 8,
    scaleX: 1,
    scaleY: 1,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    metadata: { note: 'Border town', population: 2_400 },
    revision: 1,
    assetId: FIXTURE_IDS.asset,
    stampKind: 'town',
    tint: null,
    flipX: false,
    flipY: false,
    randomSeed: 42,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  });
}

export function createMapChunkPayloadFixture(): MapChunkPayload {
  return mapChunkPayloadSchema.parse({
    id: FIXTURE_IDS.chunk,
    mapId: FIXTURE_IDS.map,
    coordinate: { x: 1, y: -1 },
    objectCount: 1,
    revision: 3,
    updatedAt: FIXTURE_TIMESTAMP,
    objects: [createStampMapObjectFixture()],
  });
}

export function createApplyOperationsRequestFixture(): ApplyOperationsRequest {
  return applyOperationsRequestSchema.parse({
    schemaVersion: 1,
    baseRevision: 3,
    clientMutationId: FIXTURE_IDS.mutation,
    operations: [
      {
        type: 'object.update',
        objectId: FIXTURE_IDS.object,
        changes: { x: 2_048, y: 512 },
      },
    ],
  });
}

export const invalidMapDocumentFixtures: readonly unknown[] = [
  {
    ...createMapDocumentFixture(),
    schemaVersion: 99,
  },
  {
    ...createMapDocumentFixture(),
    background: { kind: 'solid', color: 'navy' },
  },
  {
    ...createMapDocumentFixture(),
    unexpected: true,
  },
];

export const invalidStampMapObjectFixtures: readonly unknown[] = [
  {
    ...createStampMapObjectFixture(),
    scaleX: 0,
  },
  {
    ...createStampMapObjectFixture(),
    x: Number.POSITIVE_INFINITY,
  },
  {
    ...createStampMapObjectFixture(),
    tint: '#abc',
  },
];
