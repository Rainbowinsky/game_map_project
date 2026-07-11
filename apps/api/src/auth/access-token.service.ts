import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

const accessTokenPayloadSchema = z
  .object({
    sub: z.string().uuid(),
    tokenUse: z.literal('access'),
  })
  .passthrough();

export interface AccessTokenClaims {
  readonly userId: string;
}

@Injectable()
export class AccessTokenService {
  private readonly secret: Uint8Array;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.secret = new TextEncoder().encode(config.jwtSecret);
  }

  get expiresInSeconds(): number {
    return this.config.jwtAccessTtlSeconds;
  }

  async issue(userId: string): Promise<string> {
    const now = Math.floor(Date.now() / 1_000);

    return new SignJWT({ tokenUse: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.jwtIssuer)
      .setAudience(this.config.jwtAudience)
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.jwtAccessTtlSeconds)
      .sign(this.secret);
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const result = await jwtVerify(token, this.secret, {
      algorithms: ['HS256'],
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
      clockTolerance: 5,
    });
    const payload = accessTokenPayloadSchema.parse(result.payload);

    return { userId: payload.sub };
  }
}
