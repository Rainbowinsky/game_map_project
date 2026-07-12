import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

@Module({ imports: [StorageModule], controllers: [AssetsController], providers: [AssetsService] })
export class AssetsModule {}
