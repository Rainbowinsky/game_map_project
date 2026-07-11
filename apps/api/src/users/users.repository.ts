import { Inject, Injectable } from '@nestjs/common';
import type { PublicUser } from '@fantasy-map/validation';

import { PrismaService } from '../prisma/prisma.service.js';

export interface AuthUserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserRecord {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
}

function toPublicUser(user: Omit<AuthUserRecord, 'passwordHash'>): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findPublicById(id: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user ? toPublicUser(user) : null;
  }

  async create(input: CreateUserRecord): Promise<PublicUser> {
    const user = await this.prisma.user.create({
      data: input,
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return toPublicUser(user);
  }
}
