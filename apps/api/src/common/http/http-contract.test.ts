import { Body, Controller, Get, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GlobalExceptionFilter } from '../errors/global-exception.filter.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';
import { StructuredLogger } from '../logging/structured-logger.js';
import { RequestIdMiddleware } from '../request/request-id.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { createAppConfigFixture } from '../../test/app-config.fixture.js';
import { configureHttpApplication } from '../../bootstrap.js';

const inputSchema = z.object({ name: z.string().trim().min(1) }).strict();

@Controller()
class ContractTestController {
  @Get('ok')
  ok(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('input')
  input(@Body(new ZodValidationPipe(inputSchema)) body: z.infer<typeof inputSchema>) {
    return body;
  }

  @Get('failure')
  failure(): never {
    throw new Error('Prisma failed at C:\\private\\schema.prisma with mysql://root:secret@db/maps');
  }
}

describe('HTTP contract infrastructure', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContractTestController],
    }).compile();
    const config = createAppConfigFixture();
    const logger = new StructuredLogger(config, () => undefined);
    const requestId = new RequestIdMiddleware();

    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureHttpApplication(app as NestExpressApplication, config);
    app.use((incoming: Request, response: Response, next: NextFunction) =>
      requestId.use(incoming, response, next),
    );
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter(logger, config));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('wraps success responses and propagates a valid request ID', async () => {
    const suppliedRequestId = '30000000-0000-4000-8000-000000000001';
    const response = await request(app.getHttpServer())
      .get('/api/v1/ok')
      .set('X-Request-Id', suppliedRequestId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(suppliedRequestId);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toEqual({
      data: { status: 'ok' },
      meta: { requestId: suppliedRequestId },
    });
  });

  it('returns a safe validation error for unknown fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/input')
      .send({ name: 'Atlas', admin: true })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.body.error.details.issues[0].path).toEqual([]);
  });

  it('does not expose Prisma details, database URLs, stacks or disk paths', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/failure').expect(500);
    const serialized = JSON.stringify(response.body);

    expect(response.body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(serialized).not.toContain('Prisma');
    expect(serialized).not.toContain('mysql://');
    expect(serialized).not.toContain('schema.prisma');
  });

  it('allows only configured CORS origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/ok')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
