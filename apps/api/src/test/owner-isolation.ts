import { expect } from 'vitest';

export const protectedOperationKinds = ['enumerate', 'read', 'update', 'delete'] as const;

export async function expectOwnerIsolation(
  authorize: (actorId: string, resourceId: string) => Promise<unknown>,
  intruderId: string,
  resourceId: string,
): Promise<void> {
  for (const operation of protectedOperationKinds) {
    await expect(authorize(intruderId, resourceId), operation).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
    });
  }
}
