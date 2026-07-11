import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';

import { StructuredLogger } from '../logging/structured-logger.js';
import { getRequestId } from '../request/request-id.js';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(StructuredLogger) private readonly logger: StructuredLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);
    const startedAt = performance.now();

    return next.handle().pipe(
      finalize(() => {
        this.logger.log('Request completed.', {
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        });
      }),
    );
  }
}
