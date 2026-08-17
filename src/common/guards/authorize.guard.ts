import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '@/common/exceptions/app-error.js';

export type PortalRole = 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR' | 'ADMIN';

/** Real RBAC per ARCHITECTURE §7.2 — role membership only; ownership is `requireTeamAccess()`'s job. */
export function authorize(...roles: PortalRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError('Not authenticated'));
      return;
    }
    if (!roles.includes(req.auth.role as PortalRole)) {
      next(new ForbiddenError('Your role cannot perform this action'));
      return;
    }
    next();
  };
}

/**
 * Enforces §7.2's ownership row: a DEPARTMENT_MANAGER reaches only a team
 * they manage; ADMIN reaches everything, same as its blanket access
 * elsewhere (`users` module); other roles are refused outright.
 * `resolveManagerId` is injected per-route by the module that owns the
 * resource (`teams`, P3) — this guard stays resource-agnostic so it doesn't
 * import a repository that doesn't exist yet.
 */
export function requireTeamAccess(resolveManagerId: (req: Request) => Promise<string | null>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        next(new UnauthorizedError('Not authenticated'));
        return;
      }

      if (req.auth.role === 'ADMIN') {
        next();
        return;
      }

      if (req.auth.role !== 'DEPARTMENT_MANAGER') {
        next(new ForbiddenError('Your role cannot perform this action'));
        return;
      }

      const managerId = await resolveManagerId(req);
      if (managerId === null || managerId !== req.auth.sub) {
        next(new ForbiddenError('You do not manage this team'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
