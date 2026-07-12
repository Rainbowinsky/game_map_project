import { Module } from '@nestjs/common';

import { UserConfigController } from './user-config.controller.js';
import { UserConfigService } from './user-config.service.js';

@Module({ controllers: [UserConfigController], providers: [UserConfigService] })
export class UserConfigModule {}
