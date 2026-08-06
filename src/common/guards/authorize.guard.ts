import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError } from '@/common/exceptions/app-error.js';

export type PortalRole = 'MANAGER' | 'HR' | 'CONTENT_MANAGER' | 'ADMIN';

/**
 * Skeleton — real RBAC per ARCHITECTURE §7.2 lands in P2-5. Kept as
 * `authorize(...roles)` so route tables written now slot the real guard in
 * without a rewrite.
 */
export function authorize(..._roles: PortalRole[]) {
  return (_req: Request, _res: Response, _next: NextFunction): void => {
    throw new ForbiddenError('Not implemented until Phase 2');
  };
}
