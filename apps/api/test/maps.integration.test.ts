import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AuthResponse } from '@fantasy-map/validation';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureHttpApplication } from '../src/bootstrap.js';
import { StructuredLogger } from '../src/common/logging/structured-logger.js';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanTestDatabase } from '../src/prisma/test-database-cleaner.js';

describe('P4 map APIs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let author: AuthResponse;
  let intruder: AuthResponse;
  let projectId: string;
  let mapId: string;
  let stampLayerId: string;
  let assetId: string;

  const token = (): string => `Bearer ${author.accessToken}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StructuredLogger)
      .useValue({
        log: () => undefined,
        error: () => undefined,
        warn: () => undefined,
        debug: () => undefined,
        verbose: () => undefined,
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureHttpApplication(app as NestExpressApplication, app.get<AppConfig>(APP_CONFIG));
    await app.init();
    prisma = app.get(PrismaService);
    await cleanTestDatabase(prisma, process.env.DATABASE_URL ?? '');
    author = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'map-author@example.com',
          password: 'a-secure-map-password',
          displayName: 'Map Author',
        })
        .expect(201)
    ).body.data;
    intruder = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'map-intruder@example.com',
          password: 'a-secure-map-password',
          displayName: 'Map Intruder',
        })
        .expect(201)
    ).body.data;
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma, process.env.DATABASE_URL ?? '');
    await app?.close();
  });

  it('creates a project and an aggregate map with its default stamp layer', async () => {
    const project = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', token())
      .send({ name: 'Aurelia', description: 'A refined test realm' })
      .expect(201);
    projectId = project.body.data.id;
    const map = await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.body.data.id}/maps`)
      .set('Authorization', token())
      .send({ name: 'The Coast', width: 20_000, height: 15_000 })
      .expect(201);
    mapId = map.body.data.id;
    stampLayerId = map.body.data.layers[0].id;
    expect(map.body.data).toMatchObject({
      name: 'The Coast',
      revision: 0,
      layers: [{ name: 'Landmarks', type: 'stamp', order: 0 }],
    });
    assetId = (
      await prisma.asset.create({
        data: {
          ownerId: null,
          kind: 'STAMP',
          displayName: 'Built-in Town',
          relativePath: 'stamps/town.svg',
          mimeType: 'image/svg+xml',
          extension: 'svg',
          byteSize: 1,
          sha256: 'b'.repeat(64),
          metadata: {},
        },
      })
    ).id;
    await prisma.mapDocument.update({ where: { mapId }, data: { schemaVersion: 1 } });
    const legacyMap = await request(app.getHttpServer())
      .get(`/api/v1/maps/${mapId}`)
      .set('Authorization', token())
      .expect(200);
    expect(legacyMap.body.data.schemaVersion).toBe(2);
  });

  it('applies an object operation once, serves the resulting chunk, and rejects a stale revision', async () => {
    const mutationId = randomUUID();
    const payload = {
      schemaVersion: 2,
      baseRevision: 0,
      clientMutationId: mutationId,
      operations: [
        {
          type: 'object.create',
          object: {
            id: randomUUID(),
            layerId: stampLayerId,
            type: 'stamp',
            name: 'Aurelia',
            x: 120,
            y: 300,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            zIndex: 0,
            visible: true,
            locked: false,
            opacity: 1,
            metadata: {},
            assetId,
            stampKind: 'town',
            tint: null,
            flipX: false,
            flipY: false,
            randomSeed: 7,
          },
        },
      ],
    };
    const applied = await request(app.getHttpServer())
      .post(`/api/v1/maps/${mapId}/operations`)
      .set('Authorization', token())
      .send(payload)
      .expect(201);
    expect(applied.body.data).toMatchObject({
      mapId,
      previousRevision: 0,
      revision: 1,
      acceptedMutationId: mutationId,
      changedChunkKeys: ['0:0'],
    });
    const retried = await request(app.getHttpServer())
      .post(`/api/v1/maps/${mapId}/operations`)
      .set('Authorization', token())
      .send(payload)
      .expect(201);
    expect(retried.body.data).toEqual(applied.body.data);
    const chunk = await request(app.getHttpServer())
      .get(`/api/v1/maps/${mapId}/chunks/0/0`)
      .set('Authorization', token())
      .expect(200);
    expect(chunk.body.data).toMatchObject({
      objectCount: 1,
      objects: [{ type: 'stamp', assetId, chunk: { x: 0, y: 0 } }],
    });
    await request(app.getHttpServer())
      .post(`/api/v1/maps/${mapId}/operations`)
      .set('Authorization', token())
      .send({ ...payload, clientMutationId: randomUUID() })
      .expect(409);
    await expect(prisma.mapDocument.findUniqueOrThrow({ where: { mapId } })).resolves.toMatchObject(
      {
        schemaVersion: 1,
      },
    );
  });

  it('does not disclose another user’s map through aggregate or chunk routes', async () => {
    const intruderToken = `Bearer ${intruder.accessToken}`;
    await request(app.getHttpServer())
      .get(`/api/v1/maps/${mapId}`)
      .set('Authorization', intruderToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/maps/${mapId}/chunks`)
      .set('Authorization', intruderToken)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/maps/${mapId}/operations`)
      .set('Authorization', intruderToken)
      .send({
        schemaVersion: 2,
        baseRevision: 1,
        clientMutationId: randomUUID(),
        operations: [{ type: 'layer.reorder', parentId: null, orderedLayerIds: [stampLayerId] }],
      })
      .expect(404);
  });

  it('atomically links a location and marker, and rejects foreign map or asset references', async () => {
    const regionLayerId = randomUUID();
    const markerLayerId = randomUUID();
    const regionId = randomUUID();
    const locationId = randomUUID();
    const markerId = randomUUID();
    const mutationId = randomUUID();
    await request(app.getHttpServer())
      .post(`/api/v1/maps/${mapId}/operations`)
      .set('Authorization', token())
      .send({
        schemaVersion: 2,
        baseRevision: 1,
        clientMutationId: mutationId,
        operations: [
          {
            type: 'layer.create',
            layer: {
              id: regionLayerId,
              parentId: null,
              name: 'Regions',
              type: 'region',
              order: 1,
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
            },
          },
          {
            type: 'layer.create',
            layer: {
              id: markerLayerId,
              parentId: null,
              name: 'Places',
              type: 'marker',
              order: 2,
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
            },
          },
          {
            type: 'object.create',
            object: {
              id: regionId,
              layerId: regionLayerId,
              type: 'region',
              name: 'Northmarch',
              x: 1_000,
              y: 1_000,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              zIndex: 0,
              visible: true,
              locked: false,
              opacity: 1,
              metadata: {},
              vertices: [
                { x: 500, y: 500 },
                { x: 2_000, y: 500 },
                { x: 1_200, y: 2_000 },
              ],
              fillToken: 'region.plains.fill',
              strokeToken: 'region.plains.stroke',
              strokeWidth: 3,
            },
          },
          {
            type: 'location.create',
            location: {
              id: locationId,
              name: 'Northwatch',
              type: 'settlement',
              x: 1_200,
              y: 900,
              summary: 'A fortified town',
              description: null,
              regionId,
              iconAssetId: assetId,
              tags: ['border'],
              customFields: {},
              minZoom: 0.5,
              maxZoom: 8,
            },
          },
          {
            type: 'object.create',
            object: {
              id: markerId,
              layerId: markerLayerId,
              type: 'marker',
              name: 'Northwatch marker',
              x: 1_200,
              y: 900,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              zIndex: 0,
              visible: true,
              locked: false,
              opacity: 1,
              metadata: {},
              locationId,
              iconAssetId: assetId,
              minZoom: 0.5,
              maxZoom: 8,
            },
          },
        ],
      })
      .expect(201);

    await expect(
      prisma.location.findUniqueOrThrow({ where: { id: locationId } }),
    ).resolves.toMatchObject({
      mapId,
      markerObjectId: markerId,
      iconAssetId: assetId,
      regionId,
    });
    await expect(prisma.mapDocument.findUniqueOrThrow({ where: { mapId } })).resolves.toMatchObject(
      {
        schemaVersion: 2,
      },
    );

    const intruderAssetId = (
      await prisma.asset.create({
        data: {
          ownerId: intruder.user.id,
          kind: 'IMAGE',
          displayName: 'Private marker',
          relativePath: 'users/private-marker.png',
          mimeType: 'image/png',
          extension: 'png',
          byteSize: 1,
          sha256: 'c'.repeat(64),
          metadata: {},
        },
      })
    ).id;
    const rejectedAsset = await request(app.getHttpServer())
      .post(`/api/v1/maps/${mapId}/operations`)
      .set('Authorization', token())
      .send({
        schemaVersion: 2,
        baseRevision: 2,
        clientMutationId: randomUUID(),
        operations: [
          { type: 'object.update', objectId: markerId, changes: { iconAssetId: intruderAssetId } },
        ],
      })
      .expect(404);
    expect(rejectedAsset.body.error.code).toBe('RESOURCE_NOT_FOUND');

    const secondMap = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/maps`)
      .set('Authorization', token())
      .send({ name: 'The Inland', width: 20_000, height: 15_000 })
      .expect(201);
    const secondMapId = secondMap.body.data.id;
    const secondMarkerLayerId = randomUUID();
    await request(app.getHttpServer())
      .post(`/api/v1/maps/${secondMapId}/operations`)
      .set('Authorization', token())
      .send({
        schemaVersion: 2,
        baseRevision: 0,
        clientMutationId: randomUUID(),
        operations: [
          {
            type: 'layer.create',
            layer: {
              id: secondMarkerLayerId,
              parentId: null,
              name: 'Places',
              type: 'marker',
              order: 1,
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
            },
          },
        ],
      })
      .expect(201);
    const rejectedReference = await request(app.getHttpServer())
      .post(`/api/v1/maps/${secondMapId}/operations`)
      .set('Authorization', token())
      .send({
        schemaVersion: 2,
        baseRevision: 1,
        clientMutationId: randomUUID(),
        operations: [
          {
            type: 'object.create',
            object: {
              id: randomUUID(),
              layerId: secondMarkerLayerId,
              type: 'marker',
              name: null,
              x: 500,
              y: 500,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              zIndex: 0,
              visible: true,
              locked: false,
              opacity: 1,
              metadata: {},
              locationId,
              iconAssetId: assetId,
              minZoom: null,
              maxZoom: null,
            },
          },
        ],
      })
      .expect(400);
    expect(rejectedReference.body.error.code).toBe('OPERATION_REJECTED');
  });

  it('returns a compatibility error for v1 operation writes', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/maps/${mapId}/operations`)
      .set('Authorization', token())
      .send({
        schemaVersion: 1,
        baseRevision: 2,
        clientMutationId: randomUUID(),
        operations: [{ type: 'layer.reorder', parentId: null, orderedLayerIds: [stampLayerId] }],
      })
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: 'MAP_SCHEMA_VERSION_UNSUPPORTED',
      details: { expectedSchemaVersion: 2, receivedSchemaVersion: 1 },
    });
  });
});
