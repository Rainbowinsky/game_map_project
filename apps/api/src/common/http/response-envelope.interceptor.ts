import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';

import { getRequestId } from '../request/request-id.js';

export interface ApiSuccessEnvelope<Value> {
  readonly data: Value;
  readonly meta: {
    readonly requestId: string;
  };
}

@Injectable()
export class ResponseEnvelopeInterceptor<Value> implements NestInterceptor<
  Value,
  ApiSuccessEnvelope<Value>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<Value>,
  ): Observable<ApiSuccessEnvelope<Value>> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = getRequestId(request);

    return next.handle().pipe(
      map((data) => ({
        data,
        meta: { requestId },
      })),
    );
  }
}
