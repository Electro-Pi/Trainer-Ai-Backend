import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';
import { verifyAccessToken } from '@/common/utils/jwt.js';

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }
  return header.slice('Bearer '.length);
}

/**
 * Verifies the RS256 access JWT and populates `req.auth` (ARCHITECTURE
 * §7.1). Never issues or accepts a token for a `Learner` — learners have no
 * `PortalUser` row and therefore no `sub` this guard could ever verify
 * (non-negotiable 1, `AU-04`).
 */
export function authenticate() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req);
      req.auth = await verifyAccessToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
