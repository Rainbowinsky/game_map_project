import { Controller, Get } from '@nestjs/common';
import { createServiceStatus } from '@fantasy-map/shared';
import { healthResponseSchema, type HealthResponse } from '@fantasy-map/validation';

@Controller('health')
export class AppController {
  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse(createServiceStatus());
  }
}
