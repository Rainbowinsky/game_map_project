import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const requestIdSchema = z.string().uuid();

export interface RequestWithId extends Request {
  requestId: string;
}

export function getRequestId(request: Request): string {
  return (request as RequestWithId).requestId ?? randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const suppliedRequestId = request.header('x-request-id');
    const parsedRequestId = requestIdSchema.safeParse(suppliedRequestId);
    const requestId = parsedRequestId.success ? parsedRequestId.data : randomUUID();

    (request as RequestWithId).requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
