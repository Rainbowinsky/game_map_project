import { describe, expect, it } from 'vitest';

import { PasswordHasherService } from './password-hasher.service.js';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();

  it('hashes with Argon2id and verifies the correct password', async () => {
    const passwordHash = await service.hash('correct horse battery staple');

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(service.verify(passwordHash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'incorrect password')).resolves.toBe(false);
  });

  it('treats malformed hashes as failed credentials', async () => {
    await expect(service.verify('not-an-argon2-hash', 'password')).resolves.toBe(false);
  });
});
