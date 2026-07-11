import { Inject, Injectable } from '@nestjs/common';

import { AppError } from '../common/errors/app-error.js';
import { OwnershipRepository, type OwnedResourceReference } from './ownership.repository.js';

type ResourceLookup = (
  actorId: string,
  resourceId: string,
) => Promise<OwnedResourceReference | null>;

@Injectable()
export class OwnershipService {
  constructor(@Inject(OwnershipRepository) private readonly ownership: OwnershipRepository) {}

  requireProject(actorId: string, projectId: string): Promise<OwnedResourceReference> {
    return this.requireOwned(this.ownership.findProject.bind(this.ownership), actorId, projectId);
  }

  requireMap(actorId: string, mapId: string): Promise<OwnedResourceReference> {
    return this.requireOwned(this.ownership.findMap.bind(this.ownership), actorId, mapId);
  }

  requireLayer(actorId: string, layerId: string): Promise<OwnedResourceReference> {
    return this.requireOwned(this.ownership.findLayer.bind(this.ownership), actorId, layerId);
  }

  requireChunk(actorId: string, chunkId: string): Promise<OwnedResourceReference> {
    return this.requireOwned(this.ownership.findChunk.bind(this.ownership), actorId, chunkId);
  }

  requireObject(actorId: string, objectId: string): Promise<OwnedResourceReference> {
    return this.requireOwned(this.ownership.findObject.bind(this.ownership), actorId, objectId);
  }

  requireAsset(actorId: string, assetId: string): Promise<OwnedResourceReference> {
    return this.requireOwned(this.ownership.findAsset.bind(this.ownership), actorId, assetId);
  }

  private async requireOwned(
    lookup: ResourceLookup,
    actorId: string,
    resourceId: string,
  ): Promise<OwnedResourceReference> {
    const resource = await lookup(actorId, resourceId);

    if (!resource) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    }

    return resource;
  }
}
