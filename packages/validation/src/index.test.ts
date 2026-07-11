import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('rejects unknown fields at the boundary', () => {
    expect(() =>
      healthResponseSchema.parse({
        name: 'Fantasy Map Editor',
        status: 'ok',
        secret: 'must not cross the boundary',
      }),
    ).toThrow();
  });
});
