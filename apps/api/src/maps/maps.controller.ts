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
} from '@nestjs/common';
import { MAP_MODEL_SCHEMA_VERSION, type ApplyOperationsRequest } from '@fantasy-map/map-model';
import { Throttle } from '@nestjs/throttler';
import {
  createMapRequestSchema,
  createProjectRequestSchema,
  paginationQuerySchema,
  updateProjectRequestSchema,
  type CreateMapRequest,
  type CreateProjectRequest,
  type PaginationQuery,
  type UpdateProjectRequest,
} from '@fantasy-map/validation';

import { CurrentUser } from '../auth/authenticated-user.js';
import { AppError } from '../common/errors/app-error.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { MapsService } from './maps.service.js';
import {
  chunkParamSchema,
  createLayerRequestSchema,
  deleteLayerRequestSchema,
  layerIdParamSchema,
  mapIdParamSchema,
  operationRequestSchema,
  projectIdParamSchema,
  reorderLayersRequestSchema,
  updateLayerRequestSchema,
  type CreateLayerRequest,
  type DeleteLayerRequest,
  type OperationRequestEnvelope,
  type ReorderLayersRequest,
  type UpdateLayerRequest,
} from './maps.schemas.js';

interface Actor {
  id: string;
}

export const MAP_CHUNK_READ_THROTTLE = { limit: 2_000, ttl: 60_000 } as const;

@Controller()
export class MapsController {
  constructor(@Inject(MapsService) private readonly maps: MapsService) {}

  @Get('projects')
  listProjects(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.maps.listProjects(actor.id, query);
  }

  @Post('projects')
  createProject(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createProjectRequestSchema)) input: CreateProjectRequest,
  ) {
    return this.maps.createProject(actor.id, input);
  }

  @Get('projects/:projectId')
  getProject(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(projectIdParamSchema)) params: { projectId: string },
  ) {
    return this.maps.getProject(actor.id, params.projectId);
  }

  @Patch('projects/:projectId')
  updateProject(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(projectIdParamSchema)) params: { projectId: string },
    @Body(new ZodValidationPipe(updateProjectRequestSchema)) input: UpdateProjectRequest,
  ) {
    return this.maps.updateProject(actor.id, params.projectId, input);
  }

  @Delete('projects/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProject(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(projectIdParamSchema)) params: { projectId: string },
  ): Promise<void> {
    await this.maps.deleteProject(actor.id, params.projectId);
  }

  @Post('projects/:projectId/maps')
  createMap(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(projectIdParamSchema)) params: { projectId: string },
    @Body(new ZodValidationPipe(createMapRequestSchema)) input: CreateMapRequest,
  ) {
    return this.maps.createMap(actor.id, params.projectId, input);
  }

  @Get('maps/:mapId')
  getMap(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(mapIdParamSchema)) params: { mapId: string },
  ) {
    return this.maps.getMapDocument(actor.id, params.mapId);
  }

  @Get('maps/:mapId/chunks')
  @Throttle({ default: MAP_CHUNK_READ_THROTTLE })
  listChunks(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(mapIdParamSchema)) params: { mapId: string },
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.maps.listChunks(actor.id, params.mapId, query);
  }

  @Get('maps/:mapId/chunks/:x/:y')
  @Throttle({ default: MAP_CHUNK_READ_THROTTLE })
  getChunk(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(chunkParamSchema)) params: { mapId: string; x: number; y: number },
  ) {
    return this.maps.getChunk(actor.id, params.mapId, params.x, params.y);
  }

  @Post('maps/:mapId/operations')
  applyOperations(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(mapIdParamSchema)) params: { mapId: string },
    @Body(new ZodValidationPipe(operationRequestSchema)) input: OperationRequestEnvelope,
  ) {
    if (input.schemaVersion !== MAP_MODEL_SCHEMA_VERSION) {
      throw new AppError(
        'MAP_SCHEMA_VERSION_UNSUPPORTED',
        'This editor version cannot write the supplied map schema version.',
        409,
        {
          expectedSchemaVersion: MAP_MODEL_SCHEMA_VERSION,
          receivedSchemaVersion: input.schemaVersion,
        },
      );
    }
    return this.maps.applyOperations(actor.id, params.mapId, {
      ...input,
      schemaVersion: MAP_MODEL_SCHEMA_VERSION,
    } as ApplyOperationsRequest);
  }

  @Post('maps/:mapId/layers')
  createLayer(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(mapIdParamSchema)) params: { mapId: string },
    @Body(new ZodValidationPipe(createLayerRequestSchema)) input: CreateLayerRequest,
  ) {
    return this.maps.applyOperations(actor.id, params.mapId, {
      schemaVersion: MAP_MODEL_SCHEMA_VERSION,
      ...input,
      operations: [{ type: 'layer.create', layer: input.layer }],
    });
  }

  @Patch('maps/:mapId/layers/:layerId')
  updateLayer(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(layerIdParamSchema)) params: { mapId: string; layerId: string },
    @Body(new ZodValidationPipe(updateLayerRequestSchema)) input: UpdateLayerRequest,
  ) {
    return this.maps.applyOperations(actor.id, params.mapId, {
      schemaVersion: MAP_MODEL_SCHEMA_VERSION,
      ...input,
      operations: [{ type: 'layer.update', layerId: params.layerId, changes: input.changes }],
    });
  }

  @Post('maps/:mapId/layers/reorder')
  reorderLayers(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(mapIdParamSchema)) params: { mapId: string },
    @Body(new ZodValidationPipe(reorderLayersRequestSchema)) input: ReorderLayersRequest,
  ) {
    return this.maps.applyOperations(actor.id, params.mapId, {
      schemaVersion: MAP_MODEL_SCHEMA_VERSION,
      ...input,
      operations: [
        { type: 'layer.reorder', parentId: input.parentId, orderedLayerIds: input.orderedLayerIds },
      ],
    });
  }

  @Delete('maps/:mapId/layers/:layerId')
  deleteLayer(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(layerIdParamSchema)) params: { mapId: string; layerId: string },
    @Body(new ZodValidationPipe(deleteLayerRequestSchema)) input: DeleteLayerRequest,
  ) {
    return this.maps.applyOperations(actor.id, params.mapId, {
      schemaVersion: MAP_MODEL_SCHEMA_VERSION,
      ...input,
      operations: [
        {
          type: 'layer.delete',
          layerId: params.layerId,
          objectPolicy: input.objectPolicy,
          ...(input.targetLayerId ? { targetLayerId: input.targetLayerId } : {}),
        },
      ],
    });
  }
}
