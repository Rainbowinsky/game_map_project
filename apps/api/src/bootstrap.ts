import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import type { AppConfig } from './config/app-config.js';

export function configureHttpApplication(app: NestExpressApplication, config: AppConfig): void {
  app.use(helmet());
  app.useBodyParser('json', { limit: config.requestBodyLimit });
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'ETag'],
  });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
}
