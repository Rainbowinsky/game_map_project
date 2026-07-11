import { Inject, Injectable } from '@nestjs/common';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@fantasy-map/validation';

import { Prisma } from '../generated/prisma/client.js';
import { UsersRepository } from '../users/users.repository.js';
import { AppError } from '../common/errors/app-error.js';
import { AccessTokenService } from './access-token.service.js';
import { PasswordHasherService } from './password-hasher.service.js';

const dummyPassword = 'not-a-real-user-password-for-timing-equalization';

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(AccessTokenService) private readonly accessTokens: AccessTokenService,
  ) {
    this.dummyHash = this.passwordHasher.hash(dummyPassword);
  }

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const passwordHash = await this.passwordHasher.hash(input.password);

    try {
      const user = await this.users.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      });

      return this.createAuthResponse(user, await this.accessTokens.issue(user.id));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists.',
          409,
        );
      }

      throw error;
    }
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const user = await this.users.findByEmail(input.email);
    const passwordHash = user?.passwordHash ?? (await this.dummyHash);
    const validPassword = await this.passwordHasher.verify(passwordHash, input.password);

    if (!user || !validPassword) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    return this.createAuthResponse(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      await this.accessTokens.issue(user.id),
    );
  }

  private createAuthResponse(user: AuthResponse['user'], accessToken: string): AuthResponse {
    return {
      user,
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokens.expiresInSeconds,
    };
  }
}
