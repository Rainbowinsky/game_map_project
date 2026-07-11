import { Module } from '@nestjs/common';

import { OwnershipRepository } from './ownership.repository.js';
import { OwnershipService } from './ownership.service.js';

@Module({
  providers: [OwnershipRepository, OwnershipService],
  exports: [OwnershipRepository, OwnershipService],
})
export class OwnershipModule {}
