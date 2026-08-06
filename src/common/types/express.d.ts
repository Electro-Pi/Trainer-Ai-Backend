import type { Locale } from '@/i18n/index.js';

// The ONE place `declare global` lives (ARCHITECTURE §4). Every module reads
// these fields off `req` instead of re-augmenting Express itself.

export interface AuthContext {
  sub: string;
  orgId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      locale: Locale;
      auth?: AuthContext;
    }
  }
}

export {};
