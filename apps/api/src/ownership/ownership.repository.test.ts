import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { OwnershipRepository } from './ownership.repository.js';

const actorId = '60000000-0000-4000-8000-000000000001';
const resourceId = '60000000-0000-4000-8000-000000000002';

describe('OwnershipRepository query constraints', () => {
  it('includes actor ownership in every resource query', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      project: { findFirst },
      map: { findFirst },
      mapLayer: { findFirst },
      mapChunk: { findFirst },
      mapObject: { findFirst },
      asset: { findFirst },
    } as unknown as PrismaService;
    const repository = new OwnershipRepository(prisma);

    await repository.findProject(actorId, resourceId);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { id: resourceId, ownerId: actorId },
      select: { id: true },
    });

    await repository.findMap(actorId, resourceId);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { id: resourceId, project: { ownerId: actorId } },
      select: { id: true },
    });

    for (const lookup of [
      repository.findLayer.bind(repository),
      repository.findChunk.bind(repository),
      repository.findObject.bind(repository),
    ]) {
      await lookup(actorId, resourceId);
      expect(findFirst).toHaveBeenLastCalledWith({
        where: { id: resourceId, map: { project: { ownerId: actorId } } },
        select: { id: true },
      });
    }

    await repository.findAsset(actorId, resourceId);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { id: resourceId, ownerId: actorId },
      select: { id: true },
    });
  });
});
