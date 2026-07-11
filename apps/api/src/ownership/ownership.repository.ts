import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

export interface OwnedResourceReference {
  readonly id: string;
}

@Injectable()
export class OwnershipRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findProject(actorId: string, projectId: string): Promise<OwnedResourceReference | null> {
    return this.prisma.project.findFirst({
      where: { id: projectId, ownerId: actorId },
      select: { id: true },
    });
  }

  findMap(actorId: string, mapId: string): Promise<OwnedResourceReference | null> {
    return this.prisma.map.findFirst({
      where: { id: mapId, project: { ownerId: actorId } },
      select: { id: true },
    });
  }

  findLayer(actorId: string, layerId: string): Promise<OwnedResourceReference | null> {
    return this.prisma.mapLayer.findFirst({
      where: { id: layerId, map: { project: { ownerId: actorId } } },
      select: { id: true },
    });
  }

  findChunk(actorId: string, chunkId: string): Promise<OwnedResourceReference | null> {
    return this.prisma.mapChunk.findFirst({
      where: { id: chunkId, map: { project: { ownerId: actorId } } },
      select: { id: true },
    });
  }

  findObject(actorId: string, objectId: string): Promise<OwnedResourceReference | null> {
    return this.prisma.mapObject.findFirst({
      where: { id: objectId, map: { project: { ownerId: actorId } } },
      select: { id: true },
    });
  }

  findAsset(actorId: string, assetId: string): Promise<OwnedResourceReference | null> {
    return this.prisma.asset.findFirst({
      where: { id: assetId, ownerId: actorId },
      select: { id: true },
    });
  }
}
