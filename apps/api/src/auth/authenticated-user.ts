import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicUser } from '@fantasy-map/validation';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  },
);
