import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';

/**
 * Skeleton — real tenant-scoping via AsyncLocalStorage lands with the Prisma
 * client extension in P1-4 (ARCHITECTURE §7.3).
 */
export function tenantScope() {
  return (_req: Request, _res: Response, _next: NextFunction): void => {
    throw new UnauthorizedError('Not implemented until Phase 2');
  };
}
