import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AuthResponse } from '@fantasy-map/validation';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureHttpApplication } from '../src/bootstrap.js';
import { StructuredLogger } from '../src/common/logging/structured-logger.js';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanTestDatabase } from '../src/prisma/test-database-cleaner.js';

describe('P2-5 asset APIs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: AuthResponse;
  let intruder: AuthResponse;
  let assetId: string;
  let categoryId: string;

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
    owner = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'asset-owner@example.com',
          password: 'secure-asset-owner-password',
          displayName: 'Asset Owner',
        })
        .expect(201)
    ).body.data;
    intruder = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'asset-intruder@example.com',
          password: 'secure-asset-intruder-password',
          displayName: 'Asset Intruder',
        })
        .expect(201)
    ).body.data;
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma, process.env.DATABASE_URL ?? '');
    await app?.close();
  });

  const bearer = (session: AuthResponse) => `Bearer ${session.accessToken}`;

  it('creates an owner-scoped category and uploads a validated image with a thumbnail', async () => {
    categoryId = (
      await request(app.getHttpServer())
        .post('/api/v1/asset-categories')
        .set('Authorization', bearer(owner))
        .send({ name: 'Settlement Icons' })
        .expect(201)
    ).body.data.id;
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/asset-categories')
      .set('Authorization', bearer(owner))
      .send({ name: 'Settlement Icons' })
      .expect(409);
    expect(duplicate.body.error.code).toBe('ASSET_CATEGORY_NAME_CONFLICT');
    const png = await sharp({
      create: { width: 48, height: 32, channels: 4, background: '#607d55' },
    })
      .png()
      .toBuffer();
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Authorization', bearer(owner))
      .field('displayName', 'Forest Keep')
      .field('kind', 'IMAGE')
      .field('categoryId', categoryId)
      .attach('file', png, { filename: 'forest-keep.png', contentType: 'image/png' })
      .expect(201);
    assetId = uploaded.body.data.id;
    expect(uploaded.body.data).toMatchObject({
      displayName: 'Forest Keep',
      categoryId,
      mimeType: 'image/png',
      extension: 'png',
      width: 48,
      height: 32,
      builtIn: false,
    });
    expect(uploaded.body.data).not.toHaveProperty('relativePath');
    expect(uploaded.body.data).not.toHaveProperty('thumbnailPath');

    const thumbnail = await request(app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/thumbnail`)
      .set('Authorization', bearer(owner))
      .expect(200);
    expect(thumbnail.headers['content-type']).toMatch(/^image\/webp/);
    expect((await sharp(thumbnail.body).metadata()).format).toBe('webp');
  });

  it('isolates list, category, and binary reads from other users', async () => {
    const ownerList = await request(app.getHttpServer())
      .get('/api/v1/assets?limit=30')
      .set('Authorization', bearer(owner))
      .expect(200);
    expect(ownerList.body.data.items.map((asset: { id: string }) => asset.id)).toContain(assetId);
    const intruderList = await request(app.getHttpServer())
      .get('/api/v1/assets?limit=30')
      .set('Authorization', bearer(intruder))
      .expect(200);
    expect(intruderList.body.data.items.map((asset: { id: string }) => asset.id)).not.toContain(
      assetId,
    );
    await request(app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/content`)
      .set('Authorization', bearer(intruder))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/asset-categories/${categoryId}`)
      .set('Authorization', bearer(intruder))
      .send({ name: 'Stolen' })
      .expect(404);
  });

  it('rejects active SVG content and MIME spoofing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Authorization', bearer(owner))
      .field('displayName', 'Unsafe')
      .field('kind', 'IMAGE')
      .attach(
        'file',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        {
          filename: 'unsafe.svg',
          contentType: 'image/svg+xml',
        },
      )
      .expect(400);
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Authorization', bearer(owner))
      .field('displayName', 'Spoofed')
      .field('kind', 'IMAGE')
      .attach('file', png, { filename: 'spoofed.jpg', contentType: 'image/jpeg' })
      .expect(400);
  });

  it('refuses referenced asset deletion, then soft-deletes and hides an unreferenced asset', async () => {
    const project = await prisma.project.create({
      data: { ownerId: owner.user.id, name: 'Asset refs' },
    });
    const map = await prisma.map.create({ data: { projectId: project.id, name: 'Asset map' } });
    await prisma.mapDocument.create({
      data: {
        mapId: map.id,
        schemaVersion: 2,
        width: 1000,
        height: 1000,
        themeId: 'mvp-classic',
        background: {},
        settings: {},
      },
    });
    const layer = await prisma.mapLayer.create({
      data: { mapId: map.id, name: 'Stamps', type: 'stamp', sortOrder: 0 },
    });
    const chunk = await prisma.mapChunk.create({
      data: { mapId: map.id, x: 0, y: 0, objectCount: 1 },
    });
    const objectId = randomUUID();
    await prisma.mapObject.create({
      data: {
        id: objectId,
        mapId: map.id,
        layerId: layer.id,
        chunkId: chunk.id,
        type: 'stamp',
        x: 20,
        y: 20,
        payload: {
          assetId,
          stampKind: 'town',
          tint: null,
          flipX: false,
          flipY: false,
          randomSeed: 1,
        },
        metadata: {},
      },
    });
    const refused = await request(app.getHttpServer())
      .delete(`/api/v1/assets/${assetId}`)
      .set('Authorization', bearer(owner))
      .expect(409);
    expect(refused.body.error).toMatchObject({
      code: 'ASSET_IN_USE',
      details: { referenceCount: 1 },
    });

    await prisma.mapObject.delete({ where: { id: objectId } });
    await request(app.getHttpServer())
      .delete(`/api/v1/assets/${assetId}`)
      .set('Authorization', bearer(owner))
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/content`)
      .set('Authorization', bearer(owner))
      .expect(404);
    await expect(prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).resolves.toMatchObject(
      { deletedAt: expect.any(Date) },
    );
  });
});
