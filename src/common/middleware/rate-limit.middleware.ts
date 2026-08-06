import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

import { env } from '@/config/env.js';

// P2-9 — Redis-backed so limits are shared across api replicas (P0's
// in-memory store worked for a single process only). One connection reused
// by every limiter instance rather than one per limiter.
const redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

function createStore(prefix: string): RedisStore {
  return new RedisStore({
    prefix,
    sendCommand: async (...args: string[]) => {
      const [command, ...rest] = args as [string, ...string[]];
      return (await redisClient.call(command, rest)) as RedisReply;
    },
  });
}

export function rateLimitMiddleware() {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('rl:default:'),
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
    store: createStore('rl:strict:'),
  });
}
