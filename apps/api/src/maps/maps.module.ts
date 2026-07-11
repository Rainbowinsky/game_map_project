import { Module } from '@nestjs/common';

import { OwnershipModule } from '../ownership/ownership.module.js';
import { MapsController } from './maps.controller.js';
import { MapsService } from './maps.service.js';

@Module({
  imports: [OwnershipModule],
  controllers: [MapsController],
  providers: [MapsService],
  exports: [MapsService],
})
export class MapsModule {}
