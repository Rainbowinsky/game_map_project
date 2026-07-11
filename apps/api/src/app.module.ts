import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter.js';
import { HttpLoggingInterceptor } from './common/http/http-logging.interceptor.js';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor.js';
import { StructuredLogger } from './common/logging/structured-logger.js';
import { RequestIdMiddleware } from './common/request/request-id.js';
import { APP_CONFIG, AppConfigModule, type AppConfig } from './config/app-config.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OwnershipModule } from './ownership/ownership.module.js';
import { MapsModule } from './maps/maps.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    PrismaModule,
    OwnershipModule,
    MapsModule,
    StorageModule,
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        {
          ttl: config.rateLimit.ttlMs,
          limit: config.rateLimit.limit,
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    StructuredLogger,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
