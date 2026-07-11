import { Module } from '@nestjs/common';

import { UsersRepository } from '../users/users.repository.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasherService } from './password-hasher.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AccessTokenService, PasswordHasherService, UsersRepository],
  exports: [AccessTokenService, UsersRepository],
})
export class AuthModule {}
