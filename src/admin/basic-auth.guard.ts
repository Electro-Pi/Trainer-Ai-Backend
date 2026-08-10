import { timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { env } from '@/config/env.js';

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function challenge(res: Response): void {
  res.set('WWW-Authenticate', 'Basic realm="admin"');
  res.status(401).send('Authentication required');
}

/**
 * HTTP Basic Auth for `/admin/queues` (P12-4) — a browser-navigated
 * dashboard page can't carry the Bearer JWT `authenticate()` expects, so this
 * is a separate, dedicated credential (`ADMIN_DASHBOARD_USER`/`_PASSWORD`),
 * not tied to the portal-user auth flow. Constant-time compare against
 * timing attacks, same pattern as `serviceToken()`.
 */
export function basicAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Basic ') || !env.ADMIN_DASHBOARD_PASSWORD) {
      challenge(res);
      return;
    }

    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      challenge(res);
      return;
    }

    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (
      !safeEquals(user, env.ADMIN_DASHBOARD_USER) ||
      !safeEquals(password, env.ADMIN_DASHBOARD_PASSWORD)
    ) {
      challenge(res);
      return;
    }

    next();
  };
}
