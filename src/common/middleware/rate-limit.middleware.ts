import rateLimit from 'express-rate-limit';

import { env } from '@/config/env.js';

/**
 * In-memory store for P0 — fine for a single process. A Redis-backed store
 * (so limits are shared across api replicas) is P2-9's job.
 */
export function rateLimitMiddleware() {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
