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
          ownerId: author.user.id,
          kind: 'STAMP',
          displayName: 'Town',
          relativePath: 'stamps/town.svg',
          mimeType: 'image/svg+xml',
          extension: 'svg',
          byteSize: 1,
          sha256: 'b'.repeat(64),
          metadata: {},
        },
      })
    ).id;
  });

  it('applies an object operation once, serves the resulting chunk, and rejects a stale revision', async () => {
    const mutationId = randomUUID();
    const payload = {
      schemaVersion: 1,
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
        schemaVersion: 1,
        baseRevision: 1,
        clientMutationId: randomUUID(),
        operations: [{ type: 'layer.reorder', parentId: null, orderedLayerIds: [stampLayerId] }],
      })
      .expect(404);
  });
});
