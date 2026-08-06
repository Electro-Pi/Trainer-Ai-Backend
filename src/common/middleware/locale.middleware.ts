import type { NextFunction, Request, Response } from 'express';

import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/index.js';

/**
 * Header-based only for P0. Full precedence (Accept-Language →
 * PortalUser.locale → Organization.defaultLanguage per ARCHITECTURE §6.4)
 * needs those tables, which don't exist until P1/P2.
 */
export function localeMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers['accept-language'];
    const primary =
      typeof header === 'string' ? header.split(',')[0]?.split('-')[0]?.trim() : undefined;

    req.locale = primary && isSupportedLocale(primary) ? primary : DEFAULT_LOCALE;
    next();
  };
}
