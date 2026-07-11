import 'reflect-metadata';

import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { config as loadEnvironmentFile } from 'dotenv';

import { AppModule } from './app.module.js';
import { configureHttpApplication } from './bootstrap.js';
import { StructuredLogger } from './common/logging/structured-logger.js';
import { loadAppConfig } from './config/app-config.js';

loadEnvironmentFile({ path: resolve(process.cwd(), '../../.env'), quiet: true });

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();
  const logger = new StructuredLogger(config);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bodyParser: false,
  });
  configureHttpApplication(app, config);

  await app.listen(config.apiPort, config.apiHost);
  logger.log('API started.', {
    host: config.apiHost,
    port: config.apiPort,
    environment: config.nodeEnv,
  });
}

void bootstrap().catch(() => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      code: 'API_STARTUP_FAILED',
      message:
        'API startup failed. Check required environment variables and database connectivity.',
    })}\n`,
  );
  process.exitCode = 1;
});
