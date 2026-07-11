import { describe, expect, it, vi } from 'vitest';

import { expectOwnerIsolation } from '../test/owner-isolation.js';
import type { OwnershipRepository } from './ownership.repository.js';
import { OwnershipService } from './ownership.service.js';

const actorId = '50000000-0000-4000-8000-000000000001';
const resourceId = '50000000-0000-4000-8000-000000000002';

describe('OwnershipService', () => {
  it('returns owned resources', async () => {
    const repository = {
      findProject: vi.fn().mockResolvedValue({ id: resourceId }),
    } as unknown as OwnershipRepository;
    const service = new OwnershipService(repository);

    await expect(service.requireProject(actorId, resourceId)).resolves.toEqual({ id: resourceId });
    expect(repository.findProject).toHaveBeenCalledWith(actorId, resourceId);
  });

  it('uses the same non-enumerating 404 policy for every operation kind', async () => {
    const repository = {
      findProject: vi.fn().mockResolvedValue(null),
    } as unknown as OwnershipRepository;
    const service = new OwnershipService(repository);

    await expectOwnerIsolation(service.requireProject.bind(service), actorId, resourceId);
    expect(repository.findProject).toHaveBeenCalledTimes(4);
  });
});
