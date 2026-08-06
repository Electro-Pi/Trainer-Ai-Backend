import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';

/**
 * Runs the rest of the request inside `AsyncLocalStorage` carrying
 * `req.auth.orgId`, so the Prisma tenant extension (ARCHITECTURE §7.3) can
 * scope every query without services threading `organizationId` by hand.
 * Must run after the auth guard populates `req.auth` — P2's job. Until then
 * (no `req.auth`), it refuses rather than running a request unscoped.
 */
export function tenantScope() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError('Not authenticated'));
      return;
    }

    runWithTenant(req.auth.orgId, () => {
      next();
    });
  };
}
