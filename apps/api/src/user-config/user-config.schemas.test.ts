import { describe, expect, it } from 'vitest';

import { createBrushSchema, updateBrushSchema } from './user-config.schemas.js';

describe('user brush schemas', () => {
  it('normalizes a valid brush color', () => {
    expect(createBrushSchema.parse({ name: ' 暮色海岸 ', color: '#6a745b' })).toEqual({
      name: '暮色海岸',
      color: '#6A745B',
    });
  });

  it('rejects invalid colors', () => {
    expect(createBrushSchema.safeParse({ name: '海岸', color: 'green' }).success).toBe(false);
  });

  it('requires at least one update field', () => {
    expect(updateBrushSchema.safeParse({}).success).toBe(false);
  });
});
