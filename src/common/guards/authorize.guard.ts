import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '@/common/exceptions/app-error.js';
import type { ListScope } from '@/common/types/express.js';

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

/**
 * Collection-endpoint counterpart to `requireTeamAccess`.
 *
 * `requireTeamAccess` asserts ownership of ONE resource named in the URL, so
 * it cannot protect a list route — there is no id to resolve. Collections
 * were therefore left with `authenticate` + `tenantScope` only, which narrows
 * to the organization but not to the team: any signed-in user could read
 * every learner's reports and sessions in the org.
 *
 * This resolves the caller's own scope instead, which the handler then pushes
 * into its query:
 *   - `ADMIN`        → `{ scope: 'ALL' }`, org-wide (§7.2's HR row, `AU-05`).
 *   - `DEPARTMENT_MANAGER` → `{ scope: 'TEAMS', teamIds }` for the teams they
 *     manage. An empty array is a legitimate answer (a manager with no team
 *     yet) and MUST return an empty list, never an unscoped one.
 *   - anything else  → 403 before the handler runs.
 *
 * Every `PortalRole` is enumerated explicitly rather than falling through a
 * catch-all — MEMORY's P3 lesson, where a guard silently blocked ADMIN
 * because the author only thought about two roles.
 *
 * The resolved scope is handed to the handler as `req.listScope`
 * ({@link ListScope}).
 */
export function requireTeamScopedList(
  resolveTeamIds: (managerId: string) => Promise<string[]>,
  allowedRoles: readonly PortalRole[] = ['DEPARTMENT_MANAGER', 'ADMIN'],
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        next(new UnauthorizedError('Not authenticated'));
        return;
      }

      const role = req.auth.role as PortalRole;
      if (!allowedRoles.includes(role)) {
        next(new ForbiddenError('Your role cannot perform this action'));
        return;
      }

      if (role === 'ADMIN') {
        req.listScope = { scope: 'ALL' };
        next();
        return;
      }

      if (role === 'DEPARTMENT_MANAGER') {
        req.listScope = { scope: 'TEAMS', teamIds: await resolveTeamIds(req.auth.sub) };
        next();
        return;
      }

      // CONTENT_CREATOR and any role added later: refused unless a route
      // explicitly opts them in through `allowedRoles`, in which case the
      // branch above must be extended to say what scope they get. Never
      // fall through to an unscoped read.
      next(new ForbiddenError('Your role cannot perform this action'));
    } catch (error) {
      next(error);
    }
  };
}
