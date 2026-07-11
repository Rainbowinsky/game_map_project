import { describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from '../users/users.repository.js';
import type { AccessTokenService } from './access-token.service.js';
import { AuthService } from './auth.service.js';
import type { PasswordHasherService } from './password-hasher.service.js';

const user = {
  id: '60000000-0000-4000-8000-000000000001',
  email: 'author@example.com',
  passwordHash: '$argon2id$test',
  displayName: 'Atlas Maker',
  createdAt: new Date('2026-07-11T10:00:00.000Z'),
  updatedAt: new Date('2026-07-11T10:00:00.000Z'),
};

function createDependencies(foundUser: typeof user | null, passwordValid: boolean) {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(foundUser),
  } as unknown as UsersRepository;
  const passwordHasher = {
    hash: vi.fn().mockResolvedValue('$argon2id$dummy'),
    verify: vi.fn().mockResolvedValue(passwordValid),
  } as unknown as PasswordHasherService;
  const accessTokens = {
    issue: vi.fn().mockResolvedValue('signed-access-token-with-sufficient-length'),
    expiresInSeconds: 900,
  } as unknown as AccessTokenService;

  return { users, passwordHasher, accessTokens };
}

describe('AuthService login', () => {
  it('returns the same public shape without the password hash', async () => {
    const dependencies = createDependencies(user, true);
    const service = new AuthService(
      dependencies.users,
      dependencies.passwordHasher,
      dependencies.accessTokens,
    );

    await expect(
      service.login({ email: user.email, password: 'valid-password-value' }),
    ).resolves.toEqual({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: '2026-07-11T10:00:00.000Z',
        updatedAt: '2026-07-11T10:00:00.000Z',
      },
      accessToken: 'signed-access-token-with-sufficient-length',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  it.each([
    ['missing user', null, false],
    ['wrong password', user, false],
  ] as const)('uses the same credential error for %s', async (_label, foundUser, valid) => {
    const dependencies = createDependencies(foundUser, valid);
    const service = new AuthService(
      dependencies.users,
      dependencies.passwordHasher,
      dependencies.accessTokens,
    );

    await expect(
      service.login({ email: user.email, password: 'invalid-password-value' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
      statusCode: 401,
    });
    expect(dependencies.passwordHasher.verify).toHaveBeenCalledOnce();
  });
});
