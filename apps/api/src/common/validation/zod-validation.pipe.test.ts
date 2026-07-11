import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '../errors/app-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().trim().min(1).max(20) }).strict());

  it('returns parsed and normalized values', () => {
    expect(pipe.transform({ name: '  Atlas  ' })).toEqual({ name: 'Atlas' });
  });

  it('rejects unknown fields with safe machine-readable details', () => {
    expect(() => pipe.transform({ name: 'Atlas', admin: true })).toThrow(AppError);

    try {
      pipe.transform({ name: 'Atlas', admin: true });
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_FAILED', statusCode: 400 });
      expect(JSON.stringify(error)).not.toContain('password');
    }
  });
});
