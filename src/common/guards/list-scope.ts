import type { Request } from 'express';

import { ForbiddenError } from '@/common/exceptions/app-error.js';

/**
 * Turns the scope `requireTeamScopedList` put on the request into the
 * `teamIds` filter a repository query understands.
 *
 * Fails CLOSED: a missing `req.listScope` means the route was mounted without
 * the guard, and the safe answer there is 403 rather than an unscoped read of
 * every learner in the organization. That is the exact failure this helper
 * exists to prevent, so it must never default to "no filter".
 *
 * Returns `{}` for an ADMIN (org-wide is their scope) and
 * `{ teamIds }` for a DEPARTMENT_MANAGER — including `{ teamIds: [] }`, which
 * correctly yields an empty list for a manager with no teams.
 */
export function listScopeFilter(req: Request): { teamIds?: string[] } {
  const scope = req.listScope;
  if (!scope) {
    throw new ForbiddenError('Your role cannot perform this action');
  }
  return scope.scope === 'ALL' ? {} : { teamIds: scope.teamIds };
}
