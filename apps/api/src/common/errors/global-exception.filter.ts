import { Catch, HttpException, HttpStatus, Inject, type ExceptionFilter } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import { StructuredLogger } from '../logging/structured-logger.js';
import { getRequestId } from '../request/request-id.js';
import { AppError, type SafeErrorDetails } from './app-error.js';

export interface NormalizedError {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: SafeErrorDetails;
}

function httpErrorMessage(exception: HttpException): string {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (response && typeof response === 'object' && 'message' in response) {
    const message = response.message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }

  return exception.message;
}

export function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof AppError) {
    return {
      statusCode: exception.statusCode,
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }

  if (exception instanceof HttpException) {
    return {
      statusCode: exception.getStatus(),
      code: `HTTP_${exception.getStatus()}`,
      message: httpErrorMessage(exception),
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = getRequestId(request);
    const normalized = normalizeException(exception);

    this.logger.error('Request failed.', {
      requestId,
      method: request.method,
      path: request.originalUrl,
      code: normalized.code,
      statusCode: normalized.statusCode,
      exception,
      ...(this.config.nodeEnv === 'development' && exception instanceof Error
        ? { stack: exception.stack }
        : {}),
    });

    response.status(normalized.statusCode).json({
      error: {
        code: normalized.code,
        message: normalized.message,
        requestId,
        ...(normalized.details ? { details: normalized.details } : {}),
      },
    });
  }
}
