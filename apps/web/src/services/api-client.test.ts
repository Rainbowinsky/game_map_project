import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from '@fantasy-map/validation';

import { api, ApiError } from './api-client.js';
import { retryApiQuery } from './query-retry.js';
import { useSessionStore } from '../stores/session-store.js';

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

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionStore.setState({ session: null });
});

describe('API query retry policy', () => {
  it('never retries an unauthorized request', () => {
    expect(retryApiQuery(0, new ApiError('AUTHENTICATION_REQUIRED', 'expired', 401))).toBe(false);
  });

  it('retries another transient failure once', () => {
    const error = new ApiError('NETWORK_ERROR', 'offline', 0);
    expect(retryApiQuery(0, error)).toBe(true);
    expect(retryApiQuery(1, error)).toBe(false);
  });

  it('clears the matching persisted session after a protected request returns 401', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    useSessionStore.getState().setSession(session);

    await expect(
      api.getMap(session.accessToken, '70000000-0000-4000-8000-000000000003'),
    ).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().session).toBeNull();
    expect(values.size).toBe(0);
  });
});
