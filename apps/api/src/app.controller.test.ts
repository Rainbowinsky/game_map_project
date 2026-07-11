import { describe, expect, it, vi } from 'vitest';

import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('reports that the API and database are healthy', async () => {
    const prisma = {
      checkConnection: vi.fn().mockResolvedValue(undefined),
    };

    await expect(new AppController(prisma as never).getHealth()).resolves.toEqual({
      name: 'Fantasy Map Editor',
      status: 'ok',
      database: 'ok',
    });
    expect(prisma.checkConnection).toHaveBeenCalledOnce();
  });
});
