import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppConfigFixture } from '../test/app-config.fixture.js';
import { AccessTokenService } from './access-token.service.js';

const userId = '60000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.useRealTimers();
});

describe('AccessTokenService', () => {
  it('issues and verifies a constrained access token', async () => {
    const service = new AccessTokenService(createAppConfigFixture());
    const token = await service.issue(userId);

    await expect(service.verify(token)).resolves.toEqual({ userId });
    expect(service.expiresInSeconds).toBe(900);
  });

  it('rejects tampered tokens and a different audience', async () => {
    const issuer = new AccessTokenService(createAppConfigFixture());
    const token = await issuer.issue(userId);
    const verifier = new AccessTokenService(
      createAppConfigFixture({ jwtAudience: 'different-audience' }),
    );

    await expect(verifier.verify(token)).rejects.toThrow();
    await expect(issuer.verify(`${token.slice(0, -1)}x`)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-11T10:00:00.000Z'));
    const service = new AccessTokenService(createAppConfigFixture({ jwtAccessTtlSeconds: 60 }));
    const token = await service.issue(userId);
    vi.setSystemTime(new Date('2026-07-11T10:01:06.000Z'));

    await expect(service.verify(token)).rejects.toThrow();
  });
});
