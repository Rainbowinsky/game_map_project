import { Inject, Injectable } from '@nestjs/common';
import {
  applyOperationsResponseSchema,
  chunkKey,
  mapChunkDescriptorSchema,
  mapChunkPayloadSchema,
  mapDocumentSchema,
  toChunkCoordinate,
  type ApplyOperationsRequest,
  type ApplyOperationsResponse,
  type MapOperation,
} from '@fantasy-map/map-model';
import type {
  CreateMapRequest,
  CreateProjectRequest,
  PaginationQuery,
  UpdateProjectRequest,
} from '@fantasy-map/validation';
import { Prisma } from '../generated/prisma/client.js';

import { AppError } from '../common/errors/app-error.js';
import { OwnershipService } from '../ownership/ownership.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Transaction = Prisma.TransactionClient;

interface LayerState {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  sortOrder: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ObjectState {
  id: string;
  layerId: string;
  type: string;
  name: string | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  payload: Record<string, unknown>;
  metadata: Prisma.JsonObject;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const defaultSettings = {
  chunkSize: 1024,
  worldUnit: 'kilometer',
  grid: { enabled: true, size: 100, snap: false },
  camera: { minZoom: 0.02, maxZoom: 16 },
};

function reject(message: string, details?: Record<string, unknown>): never {
  throw new AppError('OPERATION_REJECTED', message, 400, details);
}

function mapSummary(map: {
  id: string;
  name: string;
  updatedAt: Date;
  document: { revision: number } | null;
}) {
  return {
    id: map.id,
    name: map.name,
    revision: map.document?.revision ?? 0,
    updatedAt: map.updatedAt.toISOString(),
  };
}

@Injectable()
export class MapsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OwnershipService) private readonly ownership: OwnershipService,
  ) {}

  async listProjects(actorId: string, query: PaginationQuery) {
    const projects = await this.prisma.project.findMany({
      where: { ownerId: actorId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        maps: {
          include: { document: { select: { revision: true } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    const hasNextPage = projects.length > query.limit;
    const items = projects.slice(0, query.limit).map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      maps: project.maps.map(mapSummary),
    }));
    return { items, nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null };
  }

  async createProject(actorId: string, input: CreateProjectRequest) {
    const project = await this.prisma.project.create({
      data: {
        ownerId: actorId,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    return this.projectResponse(project, []);
  }

  async getProject(actorId: string, projectId: string) {
    await this.ownership.requireProject(actorId, projectId);
    const project = await this.prisma.project.findFirstOrThrow({
      where: { id: projectId, ownerId: actorId },
      include: {
        maps: {
          include: { document: { select: { revision: true } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    return this.projectResponse(project, project.maps);
  }

  async updateProject(actorId: string, projectId: string, input: UpdateProjectRequest) {
    await this.ownership.requireProject(actorId, projectId);
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    };
    const project = await this.prisma.project.update({ where: { id: projectId }, data });
    return this.projectResponse(project, []);
  }

  async deleteProject(actorId: string, projectId: string): Promise<void> {
    await this.ownership.requireProject(actorId, projectId);
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  async createMap(actorId: string, projectId: string, input: CreateMapRequest) {
    await this.ownership.requireProject(actorId, projectId);
    const map = await this.prisma.$transaction(async (tx) => {
      const created = await tx.map.create({ data: { projectId, name: input.name } });
      await tx.mapDocument.create({
        data: {
          mapId: created.id,
          width: input.width,
          height: input.height,
          themeId: input.themeId,
          background: { kind: 'solid', color: '#17324D' },
          settings: defaultSettings,
        },
      });
      await tx.mapLayer.create({
        data: { mapId: created.id, name: 'Landmarks', type: 'stamp', sortOrder: 0 },
      });
      return created;
    });
    return this.getMapDocument(actorId, map.id);
  }

  async getMapDocument(actorId: string, mapId: string) {
    await this.ownership.requireMap(actorId, mapId);
    const map = await this.prisma.map.findFirstOrThrow({
      where: { id: mapId, project: { ownerId: actorId } },
      include: { document: true, layers: { orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }] } },
    });
    if (!map.document) reject('Map document is missing.');
    return mapDocumentSchema.parse({
      schemaVersion: 1,
      id: map.id,
      projectId: map.projectId,
      name: map.name,
      width: map.document.width,
      height: map.document.height,
      themeId: map.document.themeId,
      background: map.document.background,
      settings: map.document.settings,
      revision: map.document.revision,
      createdAt: map.createdAt.toISOString(),
      updatedAt: map.updatedAt.toISOString(),
      layers: map.layers.map((layer) => this.layerResponse(map.id, layer)),
    });
  }

  async listChunks(actorId: string, mapId: string, query: PaginationQuery) {
    await this.ownership.requireMap(actorId, mapId);
    const chunks = await this.prisma.mapChunk.findMany({
      where: { mapId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = chunks.length > query.limit;
    const items = chunks.slice(0, query.limit).map((chunk) => this.chunkDescriptor(chunk));
    return { items, nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null };
  }

  async getChunk(actorId: string, mapId: string, x: number, y: number) {
    await this.ownership.requireMap(actorId, mapId);
    const chunk = await this.prisma.mapChunk.findFirst({
      where: { mapId, x, y },
      include: { objects: { orderBy: [{ zIndex: 'asc' }, { id: 'asc' }] } },
    });
    if (!chunk) throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    return mapChunkPayloadSchema.parse({
      ...this.chunkDescriptor(chunk),
      objects: chunk.objects.map((object) =>
        this.objectResponse(mapId, chunk.x, chunk.y, {
          ...object,
          payload: object.payload as Record<string, unknown>,
          metadata: object.metadata as Prisma.JsonObject,
        }),
      ),
    });
  }

  async applyOperations(
    actorId: string,
    mapId: string,
    input: ApplyOperationsRequest,
  ): Promise<ApplyOperationsResponse> {
    await this.ownership.requireMap(actorId, mapId);
    try {
      return await this.prisma.$transaction(
        (tx) => this.applyTransaction(tx, actorId, mapId, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const receipt = await this.prisma.operationReceipt.findFirst({
          where: { mapId, clientMutationId: input.clientMutationId },
        });
        if (receipt) return applyOperationsResponseSchema.parse(receipt.response);
      }
      throw error;
    }
  }

  private async applyTransaction(
    tx: Transaction,
    actorId: string,
    mapId: string,
    input: ApplyOperationsRequest,
  ): Promise<ApplyOperationsResponse> {
    const map = await tx.map.findFirst({
      where: { id: mapId, project: { ownerId: actorId } },
      include: { document: true, layers: true, objects: true, chunks: true },
    });
    if (!map || !map.document)
      throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    const receipt = await tx.operationReceipt.findUnique({
      where: { mapId_clientMutationId: { mapId, clientMutationId: input.clientMutationId } },
    });
    if (receipt) return applyOperationsResponseSchema.parse(receipt.response);
    if (map.document.revision !== input.baseRevision) {
      throw new AppError('REVISION_CONFLICT', 'The map was changed by another request.', 409, {
        currentRevision: map.document.revision,
      });
    }

    const layers = new Map<string, LayerState>(map.layers.map((layer) => [layer.id, { ...layer }]));
    const objects = new Map<string, ObjectState>(
      map.objects.map((object) => [
        object.id,
        {
          ...object,
          payload: object.payload as Record<string, unknown>,
          metadata: object.metadata as Prisma.JsonObject,
        },
      ]),
    );
    const newObjectIds = new Set<string>();
    const dirtyObjectIds = new Set<string>();
    const deletedObjectIds = new Set<string>();
    const changedChunkKeys = new Set<string>();
    const chunkSize = this.getChunkSize(map.document.settings);

    for (const operation of input.operations) {
      await this.applyOperation(
        tx,
        actorId,
        mapId,
        operation,
        layers,
        objects,
        newObjectIds,
        dirtyObjectIds,
        deletedObjectIds,
        changedChunkKeys,
        chunkSize,
      );
    }
    this.validateLayers(layers);

    const objectsByChunk = new Map<string, ObjectState[]>();
    for (const object of objects.values()) {
      const coordinate = toChunkCoordinate({ x: object.x, y: object.y }, chunkSize);
      const key = chunkKey(coordinate);
      const values = objectsByChunk.get(key) ?? [];
      values.push(object);
      objectsByChunk.set(key, values);
    }

    const existingChunks = new Map(
      map.chunks.map((chunk) => [chunkKey({ x: chunk.x, y: chunk.y }), chunk]),
    );
    const allChangedKeys = new Set([...changedChunkKeys]);
    for (const objectId of dirtyObjectIds) {
      const object = objects.get(objectId);
      if (object)
        allChangedKeys.add(chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)));
    }
    for (const object of map.objects) {
      if (deletedObjectIds.has(object.id))
        allChangedKeys.add(chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)));
    }

    const chunkIds = new Map<string, string>();
    for (const key of allChangedKeys) {
      const [xPart = '', yPart = ''] = key.split(':');
      const x = Number(xPart);
      const y = Number(yPart);
      const current = existingChunks.get(key);
      const chunk = await tx.mapChunk.upsert({
        where: { mapId_x_y: { mapId, x, y } },
        create: { mapId, x, y, objectCount: objectsByChunk.get(key)?.length ?? 0, revision: 1 },
        update: { objectCount: objectsByChunk.get(key)?.length ?? 0, revision: { increment: 1 } },
        select: { id: true },
      });
      chunkIds.set(key, chunk.id);
      if (current) changedChunkKeys.add(key);
    }

    for (const id of deletedObjectIds) await tx.mapObject.delete({ where: { id } });
    for (const id of dirtyObjectIds) {
      const object = objects.get(id);
      if (!object) continue;
      const key = chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize));
      const chunkId = chunkIds.get(key) ?? existingChunks.get(key)?.id;
      if (!chunkId) reject('Object chunk could not be resolved.');
      const data = this.objectPersistenceData(object, chunkId);
      if (newObjectIds.has(id)) await tx.mapObject.create({ data: { id, mapId, ...data } });
      else await tx.mapObject.update({ where: { id }, data });
    }

    await tx.mapLayer.deleteMany({ where: { mapId, id: { notIn: [...layers.keys()] } } });
    for (const layer of layers.values()) {
      const data = {
        parentId: layer.parentId,
        name: layer.name,
        type: layer.type,
        sortOrder: layer.sortOrder,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
      };
      if (map.layers.some((existing) => existing.id === layer.id))
        await tx.mapLayer.update({ where: { id: layer.id }, data });
      else await tx.mapLayer.create({ data: { id: layer.id, mapId, ...data } });
    }

    const updatedDocument = await tx.mapDocument.update({
      where: { mapId },
      data: { revision: { increment: 1 } },
      select: { revision: true, updatedAt: true },
    });
    const response = applyOperationsResponseSchema.parse({
      mapId,
      acceptedMutationId: input.clientMutationId,
      previousRevision: input.baseRevision,
      revision: updatedDocument.revision,
      updatedAt: updatedDocument.updatedAt.toISOString(),
      changedChunkKeys: [...allChangedKeys].sort(),
    });
    await tx.operationReceipt.create({
      data: {
        mapId,
        clientMutationId: input.clientMutationId,
        previousRevision: input.baseRevision,
        resultingRevision: response.revision,
        response,
      },
    });
    return response;
  }

  private async applyOperation(
    tx: Transaction,
    actorId: string,
    mapId: string,
    operation: MapOperation,
    layers: Map<string, LayerState>,
    objects: Map<string, ObjectState>,
    newObjectIds: Set<string>,
    dirtyObjectIds: Set<string>,
    deletedObjectIds: Set<string>,
    changedChunkKeys: Set<string>,
    chunkSize: number,
  ): Promise<void> {
    switch (operation.type) {
      case 'object.create': {
        if (objects.has(operation.object.id)) reject('Object ID already exists.');
        const layer = this.requireLayer(layers, operation.object.layerId);
        if (layer.locked || layer.type !== 'stamp')
          reject('Objects can only be created on an unlocked stamp layer.');
        await this.requireAsset(tx, actorId, operation.object.assetId);
        const object: ObjectState = {
          id: operation.object.id,
          layerId: operation.object.layerId,
          type: operation.object.type,
          name: operation.object.name,
          x: operation.object.x,
          y: operation.object.y,
          rotation: operation.object.rotation,
          scaleX: operation.object.scaleX,
          scaleY: operation.object.scaleY,
          zIndex: operation.object.zIndex,
          visible: operation.object.visible,
          locked: operation.object.locked,
          opacity: operation.object.opacity,
          payload: {
            assetId: operation.object.assetId,
            stampKind: operation.object.stampKind,
            tint: operation.object.tint,
            flipX: operation.object.flipX,
            flipY: operation.object.flipY,
            randomSeed: operation.object.randomSeed,
          },
          metadata: operation.object.metadata as Prisma.JsonObject,
          revision: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        objects.set(object.id, object);
        newObjectIds.add(object.id);
        dirtyObjectIds.add(object.id);
        changedChunkKeys.add(chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)));
        return;
      }
      case 'object.update': {
        const object = this.requireObject(objects, operation.objectId);
        const previousKey = chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize));
        const currentLayer = this.requireLayer(layers, object.layerId);
        if (currentLayer.locked || object.locked) reject('Locked objects cannot be changed.');
        if (operation.changes.layerId) {
          const targetLayer = this.requireLayer(layers, operation.changes.layerId);
          if (targetLayer.locked || targetLayer.type !== 'stamp')
            reject('Objects can only move to an unlocked stamp layer.');
        }
        if (operation.changes.assetId)
          await this.requireAsset(tx, actorId, operation.changes.assetId);
        Object.assign(object, operation.changes);
        if (operation.changes.assetId !== undefined)
          object.payload.assetId = operation.changes.assetId;
        for (const key of ['stampKind', 'tint', 'flipX', 'flipY', 'randomSeed'] as const)
          if (operation.changes[key] !== undefined) object.payload[key] = operation.changes[key];
        object.revision += 1;
        dirtyObjectIds.add(object.id);
        changedChunkKeys.add(previousKey);
        changedChunkKeys.add(chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)));
        return;
      }
      case 'object.delete': {
        const object = this.requireObject(objects, operation.objectId);
        if (this.requireLayer(layers, object.layerId).locked || object.locked)
          reject('Locked objects cannot be deleted.');
        objects.delete(object.id);
        dirtyObjectIds.delete(object.id);
        deletedObjectIds.add(object.id);
        changedChunkKeys.add(chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)));
        return;
      }
      case 'object.reorder': {
        const layer = this.requireLayer(layers, operation.layerId);
        if (layer.locked) reject('Locked layers cannot be changed.');
        const siblings = [...objects.values()]
          .filter((object) => object.layerId === layer.id)
          .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
        this.requireExactIds(
          operation.orderedObjectIds,
          siblings.map((object) => object.id),
          'Object reorder must include every object in the layer exactly once.',
        );
        operation.orderedObjectIds.forEach((id, index) => {
          const object = this.requireObject(objects, id);
          object.zIndex = index;
          object.revision += 1;
          dirtyObjectIds.add(id);
          changedChunkKeys.add(
            chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)),
          );
        });
        return;
      }
      case 'layer.create': {
        if (layers.has(operation.layer.id)) reject('Layer ID already exists.');
        const parentId = operation.layer.parentId;
        if (parentId !== null && this.requireLayer(layers, parentId).type !== 'group')
          reject('Layer parent must be a group.');
        const siblings = this.layerSiblings(layers, parentId);
        if (operation.layer.order !== siblings.length)
          reject('New layer order must follow its existing siblings.');
        if (
          operation.layer.type === 'background' &&
          [...layers.values()].some((layer) => layer.type === 'background')
        )
          reject('A map can contain at most one background layer.');
        layers.set(operation.layer.id, {
          ...operation.layer,
          parentId,
          sortOrder: operation.layer.order,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return;
      }
      case 'layer.update': {
        const layer = this.requireLayer(layers, operation.layerId);
        if (
          layer.locked &&
          (operation.changes.parentId !== undefined ||
            operation.changes.name !== undefined ||
            operation.changes.opacity !== undefined ||
            operation.changes.blendMode !== undefined)
        )
          reject('Locked layers cannot be structurally changed.');
        if (
          operation.changes.parentId !== undefined &&
          operation.changes.parentId !== layer.parentId
        ) {
          if (
            operation.changes.parentId !== null &&
            this.requireLayer(layers, operation.changes.parentId).type !== 'group'
          )
            reject('Layer parent must be a group.');
          this.normalizeLayerOrders(layers, layer.parentId, layer.id);
          layer.parentId = operation.changes.parentId;
          layer.sortOrder = this.layerSiblings(layers, layer.parentId).filter(
            (sibling) => sibling.id !== layer.id,
          ).length;
        }
        Object.assign(layer, operation.changes);
        return;
      }
      case 'layer.reorder': {
        const siblings = this.layerSiblings(layers, operation.parentId);
        this.requireExactIds(
          operation.orderedLayerIds,
          siblings.map((layer) => layer.id),
          'Layer reorder must include every sibling exactly once.',
        );
        operation.orderedLayerIds.forEach((id, index) => {
          this.requireLayer(layers, id).sortOrder = index;
        });
        return;
      }
      case 'layer.delete': {
        const layer = this.requireLayer(layers, operation.layerId);
        if (layer.locked || layer.type === 'background')
          reject('Locked and background layers cannot be deleted.');
        if (this.layerSiblings(layers, layer.id).length > 0)
          reject('A layer with child layers cannot be deleted.');
        const ownedObjects = [...objects.values()].filter((object) => object.layerId === layer.id);
        if (operation.objectPolicy === 'move') {
          const target = this.requireLayer(layers, operation.targetLayerId ?? '');
          if (target.id === layer.id || target.type !== 'stamp' || target.locked)
            reject('Objects must move to a different unlocked stamp layer.');
          for (const object of ownedObjects) {
            object.layerId = target.id;
            object.revision += 1;
            dirtyObjectIds.add(object.id);
            changedChunkKeys.add(
              chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)),
            );
          }
        } else {
          for (const object of ownedObjects) {
            objects.delete(object.id);
            dirtyObjectIds.delete(object.id);
            deletedObjectIds.add(object.id);
            changedChunkKeys.add(
              chunkKey(toChunkCoordinate({ x: object.x, y: object.y }, chunkSize)),
            );
          }
        }
        layers.delete(layer.id);
        this.normalizeLayerOrders(layers, layer.parentId);
        return;
      }
      case 'map.update': {
        const changes = operation.changes;
        if (changes.name !== undefined)
          await tx.map.update({ where: { id: mapId }, data: { name: changes.name } });
        const documentData = {
          ...(changes.width !== undefined ? { width: changes.width } : {}),
          ...(changes.height !== undefined ? { height: changes.height } : {}),
          ...(changes.themeId !== undefined ? { themeId: changes.themeId } : {}),
          ...(changes.background !== undefined ? { background: changes.background } : {}),
          ...(changes.settings !== undefined ? { settings: changes.settings } : {}),
        };
        if (Object.keys(documentData).length > 0)
          await tx.mapDocument.update({ where: { mapId }, data: documentData });
        return;
      }
    }
  }

  private validateLayers(layers: Map<string, LayerState>): void {
    for (const layer of layers.values()) {
      let parentId = layer.parentId;
      const visited = new Set<string>([layer.id]);
      while (parentId !== null) {
        if (visited.has(parentId)) reject('Layer hierarchy cannot contain a cycle.');
        visited.add(parentId);
        parentId = this.requireLayer(layers, parentId).parentId;
      }
    }
    const parentIds = new Set([...layers.values()].map((layer) => layer.parentId));
    for (const parentId of parentIds) this.normalizeLayerOrders(layers, parentId);
  }

  private requireLayer(layers: Map<string, LayerState>, id: string): LayerState {
    const layer = layers.get(id);
    if (!layer) reject('Layer does not belong to this map.');
    return layer;
  }
  private requireObject(objects: Map<string, ObjectState>, id: string): ObjectState {
    const object = objects.get(id);
    if (!object) reject('Object does not belong to this map.');
    return object;
  }
  private layerSiblings(layers: Map<string, LayerState>, parentId: string | null): LayerState[] {
    return [...layers.values()]
      .filter((layer) => layer.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }
  private normalizeLayerOrders(
    layers: Map<string, LayerState>,
    parentId: string | null,
    excludingId?: string,
  ): void {
    this.layerSiblings(layers, parentId)
      .filter((layer) => layer.id !== excludingId)
      .forEach((layer, index) => {
        layer.sortOrder = index;
      });
  }
  private requireExactIds(
    received: readonly string[],
    expected: readonly string[],
    message: string,
  ): void {
    if (
      new Set(received).size !== received.length ||
      received.length !== expected.length ||
      received.some((id) => !expected.includes(id))
    )
      reject(message);
  }

  private async requireAsset(tx: Transaction, actorId: string, assetId: string): Promise<void> {
    const asset = await tx.asset.findFirst({
      where: { id: assetId, OR: [{ ownerId: actorId }, { ownerId: null }] },
      select: { id: true },
    });
    if (!asset) throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
  }

  private getChunkSize(settings: Prisma.JsonValue): number {
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      !('chunkSize' in settings) ||
      typeof settings.chunkSize !== 'number'
    )
      reject('Map settings are invalid.');
    return settings.chunkSize;
  }

  private layerResponse(mapId: string, layer: LayerState) {
    return {
      id: layer.id,
      mapId,
      parentId: layer.parentId,
      name: layer.name,
      type: layer.type,
      order: layer.sortOrder,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      createdAt: layer.createdAt.toISOString(),
      updatedAt: layer.updatedAt.toISOString(),
    };
  }
  private chunkDescriptor(chunk: {
    id: string;
    mapId: string;
    x: number;
    y: number;
    objectCount: number;
    revision: number;
    updatedAt: Date;
  }) {
    return mapChunkDescriptorSchema.parse({
      id: chunk.id,
      mapId: chunk.mapId,
      coordinate: { x: chunk.x, y: chunk.y },
      objectCount: chunk.objectCount,
      revision: chunk.revision,
      updatedAt: chunk.updatedAt.toISOString(),
    });
  }
  private objectResponse(mapId: string, x: number, y: number, object: ObjectState) {
    const payload = object.payload;
    return {
      id: object.id,
      mapId,
      layerId: object.layerId,
      chunk: { x, y },
      type: 'stamp',
      name: object.name,
      x: object.x,
      y: object.y,
      rotation: object.rotation,
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      zIndex: object.zIndex,
      visible: object.visible,
      locked: object.locked,
      opacity: object.opacity,
      metadata: object.metadata,
      revision: object.revision,
      assetId: payload.assetId,
      stampKind: payload.stampKind,
      tint: payload.tint ?? null,
      flipX: payload.flipX ?? false,
      flipY: payload.flipY ?? false,
      randomSeed: payload.randomSeed,
      createdAt: object.createdAt.toISOString(),
      updatedAt: object.updatedAt.toISOString(),
    };
  }
  private objectPersistenceData(object: ObjectState, chunkId: string) {
    return {
      layerId: object.layerId,
      chunkId,
      type: object.type,
      name: object.name,
      x: object.x,
      y: object.y,
      rotation: object.rotation,
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      zIndex: object.zIndex,
      visible: object.visible,
      locked: object.locked,
      opacity: object.opacity,
      payload: object.payload as Prisma.InputJsonValue,
      metadata: object.metadata as Prisma.InputJsonValue,
      revision: object.revision,
    };
  }
  private projectResponse(
    project: {
      id: string;
      name: string;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    maps: { id: string; name: string; updatedAt: Date; document: { revision: number } | null }[],
  ) {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      maps: maps.map(mapSummary),
    };
  }
}
