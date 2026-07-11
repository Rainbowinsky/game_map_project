import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_KEY = 'authentication:isPublic';
export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
