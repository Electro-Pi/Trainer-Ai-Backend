import type { Locale } from '@/i18n/index.js';

// The ONE place `declare global` lives (ARCHITECTURE §4). Every module reads
// these fields off `req` instead of re-augmenting Express itself.

export interface AuthContext {
  sub: string;
  orgId: string;
  role: string;
}

/**
 * What a list endpoint is allowed to return, decided by
 * `requireTeamScopedList` before the handler runs. `ALL` is org-wide (ADMIN);
 * `TEAMS` restricts to the caller's own teams and an empty `teamIds` means
 * "no teams", which must return an empty list rather than everything.
 */
export type ListScope = { scope: 'ALL' } | { scope: 'TEAMS'; teamIds: string[] };

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      locale: Locale;
      auth?: AuthContext;
      listScope?: ListScope;
    }
  }
}

export {};
