import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { AppError } from '../errors/app-error.js';

export class ZodValidationPipe<Schema extends z.ZodTypeAny> implements PipeTransform<unknown> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new AppError('VALIDATION_FAILED', 'Request validation failed.', 400, {
        issues: result.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map(String),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
