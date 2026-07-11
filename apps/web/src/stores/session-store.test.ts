import { describe, expect, it } from 'vitest';
import type { AuthResponse } from '@fantasy-map/validation';

import { parseStoredSession } from './session-store.js';

const session: AuthResponse = {
  user: {
    id: '70000000-0000-4000-8000-000000000001',
    email: 'cartographer@example.com',
    displayName: '林远',
    createdAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
  },
  accessToken: 'a'.repeat(48),
  tokenType: 'Bearer',
  expiresIn: 900,
};

describe('session persistence', () => {
  it('rejects an expired versioned session', () => {
    expect(
      parseStoredSession(JSON.stringify({ version: 2, session, expiresAt: 10_000 }), 10_000),
    ).toBeNull();
  });

  it('migrates the legacy login response with a bounded lifetime', () => {
    expect(parseStoredSession(JSON.stringify(session), 20_000)).toEqual({
      version: 2,
      session,
      expiresAt: 920_000,
    });
  });

  it('rejects malformed storage data', () => {
    expect(parseStoredSession('{bad json')).toBeNull();
  });
});
