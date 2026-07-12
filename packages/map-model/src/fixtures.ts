import { mapDocumentSchema, type MapDocument } from './document.js';
import { mapChunkPayloadSchema, type MapChunkPayload } from './chunks.js';
import {
  markerMapObjectSchema,
  pathMapObjectSchema,
  regionMapObjectSchema,
  stampMapObjectSchema,
  terrainStrokeMapObjectSchema,
  textMapObjectSchema,
  type MarkerMapObject,
  type PathMapObject,
  type RegionMapObject,
  type StampMapObject,
  type TerrainStrokeMapObject,
  type TextMapObject,
} from './objects.js';
import { applyOperationsRequestSchema, type ApplyOperationsRequest } from './operations.js';
import { locationSchema, type Location } from './locations.js';

export const FIXTURE_IDS = {
  project: '10000000-0000-4000-8000-000000000001',
  map: '10000000-0000-4000-8000-000000000002',
  backgroundLayer: '10000000-0000-4000-8000-000000000003',
  stampLayer: '10000000-0000-4000-8000-000000000004',
  object: '10000000-0000-4000-8000-000000000005',
  asset: '10000000-0000-4000-8000-000000000006',
  chunk: '10000000-0000-4000-8000-000000000007',
  mutation: '10000000-0000-4000-8000-000000000008',
  terrainLayer: '10000000-0000-4000-8000-000000000009',
  pathLayer: '10000000-0000-4000-8000-000000000010',
  regionLayer: '10000000-0000-4000-8000-000000000011',
  textLayer: '10000000-0000-4000-8000-000000000012',
  markerLayer: '10000000-0000-4000-8000-000000000013',
  terrainObject: '10000000-0000-4000-8000-000000000014',
  pathObject: '10000000-0000-4000-8000-000000000015',
  regionObject: '10000000-0000-4000-8000-000000000016',
  textObject: '10000000-0000-4000-8000-000000000017',
  markerObject: '10000000-0000-4000-8000-000000000018',
  location: '10000000-0000-4000-8000-000000000019',
} as const;

export const FIXTURE_TIMESTAMP = '2026-07-11T10:00:00.000Z';

export function createMapDocumentFixture(): MapDocument {
  return mapDocumentSchema.parse({
    schemaVersion: 2,
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

/** Raw persisted v1 fixture: it is intentionally not parsed by the v2 schema. */
export function createMapDocumentV1Fixture(): unknown {
  return { ...createMapDocumentFixture(), schemaVersion: 1 };
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

function createP2ObjectBaseFixture() {
  const stamp = createStampMapObjectFixture();
  const stampOnlyFields = new Set(['assetId', 'stampKind', 'tint', 'flipX', 'flipY', 'randomSeed']);
  return Object.fromEntries(Object.entries(stamp).filter(([key]) => !stampOnlyFields.has(key)));
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
    schemaVersion: 2,
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

export function createTerrainStrokeMapObjectFixture(): TerrainStrokeMapObject {
  return terrainStrokeMapObjectSchema.parse({
    ...createP2ObjectBaseFixture(),
    id: FIXTURE_IDS.terrainObject,
    layerId: FIXTURE_IDS.terrainLayer,
    type: 'terrain-stroke',
    terrainKind: 'forest',
    brush: { radius: 36, opacity: 0.7, spacing: 12, hardness: 0.4 },
    points: [
      { x: 1_000, y: 1_200, pressure: 0.8 },
      { x: 1_140, y: 1_260, pressure: 0.7 },
    ],
    randomSeed: 44,
    styleToken: 'terrain.forest',
  });
}

export function createPathMapObjectFixture(): PathMapObject {
  return pathMapObjectSchema.parse({
    ...createP2ObjectBaseFixture(),
    id: FIXTURE_IDS.pathObject,
    layerId: FIXTURE_IDS.pathLayer,
    type: 'path',
    pathKind: 'river',
    nodes: [
      { anchor: { x: 100, y: 200 } },
      { anchor: { x: 600, y: 500 }, handleIn: { x: -80, y: 20 } },
    ],
    styleToken: 'path.river',
    widthStart: 10,
    widthEnd: 40,
  });
}

export function createRegionMapObjectFixture(): RegionMapObject {
  return regionMapObjectSchema.parse({
    ...createP2ObjectBaseFixture(),
    id: FIXTURE_IDS.regionObject,
    layerId: FIXTURE_IDS.regionLayer,
    type: 'region',
    vertices: [
      { x: 1_000, y: 1_000 },
      { x: 2_000, y: 1_100 },
      { x: 1_500, y: 1_800 },
    ],
    fillToken: 'region.plains.fill',
    strokeToken: 'region.plains.stroke',
    strokeWidth: 3,
  });
}

export function createTextMapObjectFixture(): TextMapObject {
  return textMapObjectSchema.parse({
    ...createP2ObjectBaseFixture(),
    id: FIXTURE_IDS.textObject,
    layerId: FIXTURE_IDS.textLayer,
    type: 'text',
    text: 'The Verdant Reach',
    fontSize: 28,
    align: 'center',
    fontToken: 'font.map-label',
    colorToken: 'text.primary',
  });
}

export function createMarkerMapObjectFixture(): MarkerMapObject {
  return markerMapObjectSchema.parse({
    ...createP2ObjectBaseFixture(),
    id: FIXTURE_IDS.markerObject,
    layerId: FIXTURE_IDS.markerLayer,
    type: 'marker',
    locationId: FIXTURE_IDS.location,
    iconAssetId: FIXTURE_IDS.asset,
    minZoom: 0.25,
    maxZoom: 8,
  });
}

export function createLocationFixture(): Location {
  return locationSchema.parse({
    id: FIXTURE_IDS.location,
    mapId: FIXTURE_IDS.map,
    name: 'Northwatch',
    type: 'settlement',
    x: 1_536,
    y: -1,
    summary: 'A fortified northern border town.',
    description: null,
    regionId: null,
    iconAssetId: FIXTURE_IDS.asset,
    markerObjectId: FIXTURE_IDS.markerObject,
    tags: ['border', 'town'],
    customFields: { population: 2_400 },
    minZoom: 0.25,
    maxZoom: 8,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
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

export const invalidP2ObjectFixtures: readonly unknown[] = [
  {
    ...createRegionMapObjectFixture(),
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ],
  },
  {
    ...createPathMapObjectFixture(),
    nodes: [{ anchor: { x: 0, y: 0 } }, { anchor: { x: 0, y: 0 } }],
  },
  { ...createTextMapObjectFixture(), text: '<img src=x onerror=alert(1)>' },
  { ...createMarkerMapObjectFixture(), minZoom: 8, maxZoom: 0.25 },
];
