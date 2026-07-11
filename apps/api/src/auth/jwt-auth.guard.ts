import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppError } from '../common/errors/app-error.js';
import { UsersRepository } from '../users/users.repository.js';
import { AccessTokenService } from './access-token.service.js';
import type { AuthenticatedRequest } from './authenticated-user.js';
import { PUBLIC_ROUTE_KEY } from './public.decorator.js';

const bearerTokenPattern = /^Bearer ([A-Za-z0-9._~-]+)$/;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessTokenService) private readonly accessTokens: AccessTokenService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const match = bearerTokenPattern.exec(request.header('authorization') ?? '');

    if (!match?.[1]) {
      throw this.authenticationRequired();
    }

    try {
      const claims = await this.accessTokens.verify(match[1]);
      const user = await this.users.findPublicById(claims.userId);

      if (!user) {
        throw this.authenticationRequired();
      }

      (request as AuthenticatedRequest).user = user;
      return true;
    } catch {
      throw this.authenticationRequired();
    }
  }

  private authenticationRequired(): AppError {
    return new AppError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401);
  }
}
