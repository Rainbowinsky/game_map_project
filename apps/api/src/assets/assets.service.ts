import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type AssetKind } from '../generated/prisma/client.js';

import { AppError } from '../common/errors/app-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.js';
import type {
  AssetListQuery,
  AssetUploadFields,
  CreateAssetCategory,
  UpdateAsset,
} from './assets.schemas.js';
import { processImage } from './image-processor.js';

interface UploadFile {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}

@Injectable()
export class AssetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async upload(actorId: string, fields: AssetUploadFields, file: UploadFile | undefined) {
    if (!file) throw new AppError('ASSET_FILE_REQUIRED', 'An image file is required.', 400);
    if (/[\\/\0]/.test(file.originalname))
      throw new AppError('INVALID_ASSET_FILE', 'File name must not contain path segments.', 400);
    if (fields.categoryId) await this.requireCategory(actorId, fields.categoryId);
    const assetId = randomUUID();
    const temporaryOriginal = `temporary/${randomUUID()}.upload`;
    const temporaryThumbnail = `temporary/${randomUUID()}.webp`;
    let finalOriginal: string | undefined;
    let finalThumbnail: string | undefined;
    await this.storage.put(temporaryOriginal, file.buffer);
    try {
      const processed = await processImage(await this.storage.read(temporaryOriginal), {
        mimeType: file.mimetype,
        fileName: file.originalname,
      });
      await this.storage.put(temporaryOriginal, processed.original);
      await this.storage.put(temporaryThumbnail, processed.thumbnail);
      finalOriginal = `assets/${actorId}/${assetId}/original.${processed.extension}`;
      finalThumbnail = `assets/${actorId}/${assetId}/thumbnail.webp`;
      await this.storage.move(temporaryOriginal, finalOriginal);
      await this.storage.move(temporaryThumbnail, finalThumbnail);
      const asset = await this.prisma.asset.create({
        data: {
          id: assetId,
          ownerId: actorId,
          ...(fields.categoryId ? { categoryId: fields.categoryId } : {}),
          kind: fields.kind as AssetKind,
          displayName: fields.displayName,
          relativePath: finalOriginal,
          thumbnailPath: finalThumbnail,
          mimeType: processed.mimeType,
          extension: processed.extension,
          byteSize: BigInt(processed.original.byteLength),
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          metadata: {},
          originalFileName:
            basename(file.originalname.replace(/\p{Cc}/gu, '')).slice(0, 255) || null,
        },
      });
      return this.assetResponse(asset);
    } catch (error) {
      await Promise.allSettled([
        this.storage.delete(temporaryOriginal),
        this.storage.delete(temporaryThumbnail),
        ...(finalOriginal ? [this.storage.delete(finalOriginal)] : []),
        ...(finalThumbnail ? [this.storage.delete(finalThumbnail)] : []),
      ]);
      throw error;
    }
  }

  async list(actorId: string, query: AssetListQuery) {
    const assets = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        OR: [{ ownerId: actorId }, { ownerId: null }],
        ...(query.kind ? { kind: query.kind as AssetKind } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = assets.slice(0, query.limit);
    return {
      items: items.map((asset) => this.assetResponse(asset)),
      nextCursor: assets.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async update(actorId: string, assetId: string, input: UpdateAsset) {
    await this.requireOwnedAsset(actorId, assetId);
    if (input.categoryId) await this.requireCategory(actorId, input.categoryId);
    const asset = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
    return this.assetResponse(asset);
  }

  async remove(actorId: string, assetId: string): Promise<void> {
    const asset = await this.requireOwnedAsset(actorId, assetId);
    const [locationReferences, candidateObjects] = await Promise.all([
      this.prisma.location.count({ where: { iconAssetId: assetId } }),
      this.prisma.mapObject.findMany({
        where: { type: { in: ['stamp', 'marker'] }, map: { project: { ownerId: actorId } } },
        select: { id: true, payload: true },
      }),
    ]);
    const objectReferences = candidateObjects.filter((object) => {
      const payload = object.payload;
      return (
        !!payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        (('assetId' in payload && payload.assetId === assetId) ||
          ('iconAssetId' in payload && payload.iconAssetId === assetId))
      );
    }).length;
    if (locationReferences + objectReferences > 0) {
      throw new AppError('ASSET_IN_USE', 'Asset is still referenced and cannot be deleted.', 409, {
        referenceCount: locationReferences + objectReferences,
      });
    }
    await this.prisma.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
    await Promise.allSettled([
      this.storage.delete(asset.relativePath),
      ...(asset.thumbnailPath ? [this.storage.delete(asset.thumbnailPath)] : []),
    ]);
  }

  async content(actorId: string, assetId: string, thumbnail: boolean) {
    const asset = await this.findVisibleAsset(actorId, assetId);
    const key = thumbnail ? asset.thumbnailPath : asset.relativePath;
    if (!key) throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    return {
      bytes: await this.storage.read(key),
      mimeType: thumbnail ? 'image/webp' : asset.mimeType,
      etag: `"${asset.sha256}${thumbnail ? '-thumbnail' : ''}"`,
    };
  }

  async listCategories(actorId: string) {
    const categories = await this.prisma.assetCategory.findMany({
      where: { OR: [{ ownerId: actorId }, { ownerId: null }] },
      orderBy: [{ ownerId: 'asc' }, { name: 'asc' }],
    });
    return { items: categories.map((category) => this.categoryResponse(category)) };
  }

  async createCategory(actorId: string, input: CreateAssetCategory) {
    await this.assertCategoryNameAvailable(actorId, input.name);
    try {
      return this.categoryResponse(
        await this.prisma.assetCategory.create({
          data: { ownerId: actorId, name: input.name },
        }),
      );
    } catch (error) {
      this.rethrowCategoryConflict(error);
    }
  }

  async updateCategory(actorId: string, categoryId: string, input: CreateAssetCategory) {
    await this.requireOwnedCategory(actorId, categoryId);
    await this.assertCategoryNameAvailable(actorId, input.name, categoryId);
    try {
      return this.categoryResponse(
        await this.prisma.assetCategory.update({
          where: { id: categoryId },
          data: { name: input.name },
        }),
      );
    } catch (error) {
      this.rethrowCategoryConflict(error);
    }
  }

  async removeCategory(actorId: string, categoryId: string): Promise<void> {
    await this.requireOwnedCategory(actorId, categoryId);
    await this.prisma.assetCategory.delete({ where: { id: categoryId } });
  }

  private async findVisibleAsset(actorId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null, OR: [{ ownerId: actorId }, { ownerId: null }] },
    });
    if (!asset) throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    return asset;
  }

  private async requireOwnedAsset(actorId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, ownerId: actorId, deletedAt: null },
    });
    if (!asset) throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    return asset;
  }

  private async requireCategory(actorId: string, categoryId: string) {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id: categoryId, OR: [{ ownerId: actorId }, { ownerId: null }] },
    });
    if (!category) throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    return category;
  }

  private async requireOwnedCategory(actorId: string, categoryId: string) {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id: categoryId, ownerId: actorId },
    });
    if (!category) throw new AppError('RESOURCE_NOT_FOUND', 'Resource was not found.', 404);
    return category;
  }

  private async assertCategoryNameAvailable(actorId: string, name: string, excludingId?: string) {
    const existing = await this.prisma.assetCategory.findFirst({
      where: { ownerId: actorId, name, ...(excludingId ? { NOT: { id: excludingId } } : {}) },
      select: { id: true },
    });
    if (existing)
      throw new AppError(
        'ASSET_CATEGORY_NAME_CONFLICT',
        'An asset category with this name already exists.',
        409,
      );
  }

  private rethrowCategoryConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(
        'ASSET_CATEGORY_NAME_CONFLICT',
        'An asset category with this name already exists.',
        409,
      );
    }
    throw error;
  }

  private assetResponse(asset: {
    id: string;
    ownerId: string | null;
    categoryId: string | null;
    kind: AssetKind;
    displayName: string;
    mimeType: string;
    extension: string;
    byteSize: bigint;
    width: number | null;
    height: number | null;
    metadata: Prisma.JsonValue;
    originalFileName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: asset.id,
      kind: asset.kind,
      categoryId: asset.categoryId,
      displayName: asset.displayName,
      mimeType: asset.mimeType,
      extension: asset.extension,
      byteSize: Number(asset.byteSize),
      width: asset.width,
      height: asset.height,
      metadata: asset.metadata,
      originalFileName: asset.originalFileName,
      builtIn: asset.ownerId === null,
      contentUrl: `/assets/${asset.id}/content`,
      thumbnailUrl: `/assets/${asset.id}/thumbnail`,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private categoryResponse(category: {
    id: string;
    ownerId: string | null;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: category.id,
      name: category.name,
      builtIn: category.ownerId === null,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }
}
