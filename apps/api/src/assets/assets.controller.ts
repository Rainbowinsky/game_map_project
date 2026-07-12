import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentUser } from '../auth/authenticated-user.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import {
  assetIdParamSchema,
  assetListQuerySchema,
  assetUploadFieldsSchema,
  categoryIdParamSchema,
  createAssetCategorySchema,
  updateAssetCategorySchema,
  updateAssetSchema,
  type AssetListQuery,
  type AssetUploadFields,
  type CreateAssetCategory,
  type UpdateAsset,
} from './assets.schemas.js';
import { AssetsService } from './assets.service.js';
import { MAX_ASSET_BYTES } from './image-processor.js';

interface Actor {
  id: string;
}

@Controller()
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

  @Post('assets')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ASSET_BYTES, files: 1, fields: 3 } }),
  )
  upload(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(assetUploadFieldsSchema)) fields: AssetUploadFields,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.assets.upload(actor.id, fields, file);
  }

  @Get('assets')
  list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(assetListQuerySchema)) query: AssetListQuery,
  ) {
    return this.assets.list(actor.id, query);
  }

  @Patch('assets/:assetId')
  update(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(assetIdParamSchema)) params: { assetId: string },
    @Body(new ZodValidationPipe(updateAssetSchema)) input: UpdateAsset,
  ) {
    return this.assets.update(actor.id, params.assetId, input);
  }

  @Delete('assets/:assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(assetIdParamSchema)) params: { assetId: string },
  ) {
    return this.assets.remove(actor.id, params.assetId);
  }

  @Get('assets/:assetId/content')
  async content(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(assetIdParamSchema)) params: { assetId: string },
    @Res() response: Response,
  ) {
    await this.sendContent(response, await this.assets.content(actor.id, params.assetId, false));
  }

  @Get('assets/:assetId/thumbnail')
  async thumbnail(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(assetIdParamSchema)) params: { assetId: string },
    @Res() response: Response,
  ) {
    await this.sendContent(response, await this.assets.content(actor.id, params.assetId, true));
  }

  @Get('asset-categories')
  listCategories(@CurrentUser() actor: Actor) {
    return this.assets.listCategories(actor.id);
  }

  @Post('asset-categories')
  createCategory(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createAssetCategorySchema)) input: CreateAssetCategory,
  ) {
    return this.assets.createCategory(actor.id, input);
  }

  @Patch('asset-categories/:categoryId')
  updateCategory(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(categoryIdParamSchema)) params: { categoryId: string },
    @Body(new ZodValidationPipe(updateAssetCategorySchema)) input: CreateAssetCategory,
  ) {
    return this.assets.updateCategory(actor.id, params.categoryId, input);
  }

  @Delete('asset-categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCategory(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(categoryIdParamSchema)) params: { categoryId: string },
  ) {
    return this.assets.removeCategory(actor.id, params.categoryId);
  }

  private async sendContent(
    response: Response,
    content: { bytes: Uint8Array; mimeType: string; etag: string },
  ) {
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', content.bytes.byteLength);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('ETag', content.etag);
    response.send(Buffer.from(content.bytes));
  }
}
