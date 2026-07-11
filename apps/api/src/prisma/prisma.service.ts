import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { DatabaseUnavailableError } from '../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaMariaDb(config.databaseUrl),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch {
      throw new DatabaseUnavailableError();
    }
  }
}
