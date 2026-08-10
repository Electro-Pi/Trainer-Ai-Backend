import rateLimit, { MemoryStore } from 'express-rate-limit';

import { env } from '@/config/env.js';

// P2-9 was Redis-backed so limits stayed shared across api replicas; that
// dependency has been dropped, so this now uses express-rate-limit's
// in-memory `MemoryStore` — per-process only. Fine at single-instance scale;
// if the api ever runs multiple replicas, limits would need to move back to
// a shared store (e.g. Postgres-backed) to stay accurate across them.
//
// Each store is constructed explicitly (rather than left as the middleware's
// implicit default) and tracked here so `resetAllRateLimits()` — used by
// integration tests, where a single `createApp()` call's limiters live for
// the whole file and would otherwise trip across unrelated `it()` blocks —
// has a handle to clear them.
const stores: MemoryStore[] = [];

function trackedStore(): MemoryStore {
  const store = new MemoryStore();
  stores.push(store);
  return store;
}

export function resetAllRateLimits(): void {
  for (const store of stores) {
    store.resetAll();
  }
}

export function rateLimitMiddleware() {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: trackedStore(),
  });
}

/**
 * Stricter limiter for auth (`/auth/login`, `/auth/refresh`, Entra callback)
 * and public-facing routes (`WS-01` demo requests) — these are the
 * unauthenticated surface most exposed to credential-stuffing/enumeration.
 */
export function strictRateLimitMiddleware() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: trackedStore(),
  });
}

/**
 * `P8-2` — the AI team's service-token traffic (Agent Session API) is
 * higher-volume than a human's (per-question answer posts, content
 * delivered markers mid-session) but still bounded per session; generous
 * enough not to throttle a real session, tight enough to bound a
 * misbehaving/compromised caller (§9.11 rule 4 — their API is untrusted
 * input).
 */
export function agentRateLimitMiddleware() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    store: trackedStore(),
  });
}
