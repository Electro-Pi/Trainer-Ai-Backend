import { timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Authenticates the AI team's calls into the Agent Session API
 * (ARCHITECTURE §9.11) — a static shared secret in the `x-service-token`
 * header, separate from user JWTs. Constant-time compare against timing
 * attacks. Open Question #1 in MEMORY.md flags this as provisional pending
 * their confirmed auth scheme.
 */
export function serviceToken() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const presented = req.headers['x-service-token'];

    if (
      typeof presented !== 'string' ||
      !env.AI_SERVICE_TOKEN ||
      !safeEquals(presented, env.AI_SERVICE_TOKEN)
    ) {
      next(new UnauthorizedError('Invalid service token'));
      return;
    }

    next();
  };
}
