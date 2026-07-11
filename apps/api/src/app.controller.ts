import { Controller, Get, Inject } from '@nestjs/common';
import { createServiceStatus } from '@fantasy-map/shared';

import { PrismaService } from './prisma/prisma.service.js';
import { Public } from './auth/public.decorator.js';

export interface HealthResponse {
  readonly name: 'Fantasy Map Editor';
  readonly status: 'ok';
  readonly database: 'ok';
}

@Controller('health')
export class AppController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  async getHealth(): Promise<HealthResponse> {
    await this.prisma.checkConnection();

    return {
      ...createServiceStatus(),
      database: 'ok',
    };
  }
}
