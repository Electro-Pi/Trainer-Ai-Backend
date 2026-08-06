import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';

/**
 * Skeleton — authenticates the AI team's calls into the Agent Session API
 * (ARCHITECTURE §9.11). Real service-token verification lands with Phase 2.
 */
export function serviceToken() {
  return (_req: Request, _res: Response, _next: NextFunction): void => {
    throw new UnauthorizedError('Not implemented until Phase 2');
  };
}
