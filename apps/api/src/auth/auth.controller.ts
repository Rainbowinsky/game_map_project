import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  loginRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type PublicUser,
  type RegisterRequest,
} from '@fantasy-map/validation';

import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './authenticated-user.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) input: RegisterRequest,
  ): Promise<AuthResponse> {
    return this.auth.register(input);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest,
  ): Promise<AuthResponse> {
    return this.auth.login(input);
  }

  @Get('me')
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }
}
