import { describe, expect, it } from 'vitest';

import { loginRequestSchema, registerRequestSchema } from './auth.js';

describe('authentication request schemas', () => {
  it('normalizes email and display name without altering the password', () => {
    expect(
      registerRequestSchema.parse({
        email: '  Author@Example.COM ',
        password: '  long password remains unchanged  ',
        displayName: '  Atlas Maker  ',
      }),
    ).toEqual({
      email: 'author@example.com',
      password: '  long password remains unchanged  ',
      displayName: 'Atlas Maker',
    });
  });

  it('rejects short passwords and unknown fields', () => {
    expect(() =>
      loginRequestSchema.parse({ email: 'author@example.com', password: 'short' }),
    ).toThrow();
    expect(() =>
      loginRequestSchema.parse({
        email: 'author@example.com',
        password: 'a-long-test-password',
        admin: true,
      }),
    ).toThrow();
  });
});
