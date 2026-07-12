import { Inject, Injectable } from '@nestjs/common';

import { AppError } from '../common/errors/app-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBrush, UpdateBrush } from './user-config.schemas.js';

@Injectable()
export class UserConfigService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listBrushes(ownerId: string) {
    return {
      items: await this.prisma.userBrush.findMany({
        where: { ownerId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
    };
  }

  async createBrush(ownerId: string, input: CreateBrush) {
    try {
      return await this.prisma.userBrush.create({ data: { ownerId, ...input } });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppError('BRUSH_NAME_CONFLICT', '已有同名笔刷。', 409);
      }
      throw error;
    }
  }

  async updateBrush(ownerId: string, brushId: string, input: UpdateBrush) {
    await this.requireOwned(ownerId, brushId);
    try {
      return await this.prisma.userBrush.update({
        where: { id: brushId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.color === undefined ? {} : { color: input.color }),
        },
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppError('BRUSH_NAME_CONFLICT', '已有同名笔刷。', 409);
      }
      throw error;
    }
  }

  async removeBrush(ownerId: string, brushId: string): Promise<void> {
    await this.requireOwned(ownerId, brushId);
    await this.prisma.userBrush.delete({ where: { id: brushId } });
  }

  private async requireOwned(ownerId: string, brushId: string): Promise<void> {
    const brush = await this.prisma.userBrush.findFirst({
      where: { id: brushId, ownerId },
      select: { id: true },
    });
    if (!brush) throw new AppError('RESOURCE_NOT_FOUND', '笔刷不存在。', 404);
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
