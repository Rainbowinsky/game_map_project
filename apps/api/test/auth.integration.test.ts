import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { authResponseSchema, type AuthResponse } from '@fantasy-map/validation';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureHttpApplication } from '../src/bootstrap.js';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config.js';
import { OwnershipService } from '../src/ownership/ownership.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanTestDatabase } from '../src/prisma/test-database-cleaner.js';
import { StructuredLogger } from '../src/common/logging/structured-logger.js';

const authorA = {
  email: '  Author.A@Example.COM ',
  password: 'author-a-secure-password',
  displayName: 'Author A',
};
const authorB = {
  email: 'author.b@example.com',
  password: 'author-b-secure-password',
  displayName: 'Author B',
};

describe('P3 authentication and ownership', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownership: OwnershipService;
  let authA: AuthResponse;
  let authB: AuthResponse;

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
    ownership = app.get(OwnershipService);
    await cleanTestDatabase(prisma, process.env.DATABASE_URL ?? '');

    const responseA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(authorA)
      .expect(201);
    const responseB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(authorB)
      .expect(201);
    authA = authResponseSchema.parse(responseA.body.data);
    authB = authResponseSchema.parse(responseB.body.data);
  });

  afterAll(async () => {
    if (prisma) {
      await cleanTestDatabase(prisma, process.env.DATABASE_URL ?? '');
    }
    await app?.close();
  });

  it('registers normalized users and never returns password data', () => {
    expect(authA.user.email).toBe('author.a@example.com');
    expect(authA.user.displayName).toBe('Author A');
    expect(authA.accessToken).toContain('.');
    expect(JSON.stringify(authA)).not.toContain('password');
  });

  it('rejects duplicate email safely', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...authorA, email: 'AUTHOR.A@example.com' })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'An account with this email already exists.',
    });
  });

  it('uses an indistinguishable error for unknown email and wrong password', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: authA.user.email, password: 'definitely-the-wrong-password' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'definitely-the-wrong-password' })
      .expect(401);

    expect(wrongPassword.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
    expect(unknownEmail.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  });

  it('logs in and resolves the current user from a valid JWT', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: authA.user.email, password: authorA.password })
      .expect(200);
    const authentication = authResponseSchema.parse(login.body.data);
    const currentUser = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authentication.accessToken}`)
      .expect(200);

    expect(currentUser.body.data).toEqual(authA.user);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer malformed.token.value')
      .expect(401);
  });

  it('prevents user A from resolving every resource owned by user B', async () => {
    const project = await prisma.project.create({
      data: { ownerId: authB.user.id, name: 'Private project' },
    });
    const map = await prisma.map.create({
      data: { projectId: project.id, name: 'Private map' },
    });
    const layer = await prisma.mapLayer.create({
      data: {
        mapId: map.id,
        name: 'Private layer',
        type: 'stamp',
        sortOrder: 0,
      },
    });
    const chunk = await prisma.mapChunk.create({
      data: { mapId: map.id, x: 0, y: 0 },
    });
    const object = await prisma.mapObject.create({
      data: {
        id: '70000000-0000-4000-8000-000000000001',
        mapId: map.id,
        layerId: layer.id,
        chunkId: chunk.id,
        type: 'stamp',
        x: 10,
        y: 20,
        payload: { assetId: 'fixture', stampKind: 'town' },
        metadata: {},
      },
    });
    const asset = await prisma.asset.create({
      data: {
        ownerId: authB.user.id,
        kind: 'STAMP',
        displayName: 'Private asset',
        relativePath: 'stamps/private.svg',
        mimeType: 'image/svg+xml',
        extension: 'svg',
        byteSize: 10,
        sha256: 'a'.repeat(64),
        metadata: {},
      },
    });

    const checks = [
      ownership.requireProject(authA.user.id, project.id),
      ownership.requireMap(authA.user.id, map.id),
      ownership.requireLayer(authA.user.id, layer.id),
      ownership.requireChunk(authA.user.id, chunk.id),
      ownership.requireObject(authA.user.id, object.id),
      ownership.requireAsset(authA.user.id, asset.id),
    ];

    for (const check of checks) {
      await expect(check).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
      });
    }

    await expect(ownership.requireProject(authB.user.id, project.id)).resolves.toEqual({
      id: project.id,
    });
  });

  it('rate limits both registration and login routes', async () => {
    const registerStatuses: number[] = [];
    const loginStatuses: number[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'invalid', password: 'short', displayName: '' });
      registerStatuses.push(response.status);
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'missing@example.com', password: 'another-wrong-password' });
      loginStatuses.push(response.status);
    }

    expect(registerStatuses).toContain(429);
    expect(loginStatuses).toContain(429);
  });
});
