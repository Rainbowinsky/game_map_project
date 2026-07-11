import { Module } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { STORAGE_PROVIDER } from './storage-provider.js';

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new LocalStorageProvider(config.storageRoot),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
