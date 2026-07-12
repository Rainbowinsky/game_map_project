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
} from '@nestjs/common';

import { CurrentUser } from '../auth/authenticated-user.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import {
  brushIdParamSchema,
  createBrushSchema,
  updateBrushSchema,
  type CreateBrush,
  type UpdateBrush,
} from './user-config.schemas.js';
import { UserConfigService } from './user-config.service.js';

interface Actor {
  id: string;
}

@Controller('user-config/brushes')
export class UserConfigController {
  constructor(@Inject(UserConfigService) private readonly config: UserConfigService) {}

  @Get()
  list(@CurrentUser() actor: Actor) {
    return this.config.listBrushes(actor.id);
  }

  @Post()
  create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createBrushSchema)) input: CreateBrush,
  ) {
    return this.config.createBrush(actor.id, input);
  }

  @Patch(':brushId')
  update(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(brushIdParamSchema)) params: { brushId: string },
    @Body(new ZodValidationPipe(updateBrushSchema)) input: UpdateBrush,
  ) {
    return this.config.updateBrush(actor.id, params.brushId, input);
  }

  @Delete(':brushId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: Actor,
    @Param(new ZodValidationPipe(brushIdParamSchema)) params: { brushId: string },
  ) {
    return this.config.removeBrush(actor.id, params.brushId);
  }
}
