import pino from 'pino';
import { pinoHttp, type HttpLogger } from 'pino-http';

import { env } from '@/config/env.js';

export type Logger = pino.Logger;

const isDevelopment = env.NODE_ENV === 'development';

export const logger: Logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-service-token"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.tokenHash',
      '*.jwt',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

/**
 * Reuses `req.requestId` (assigned by P0-5's request-id interceptor, which
 * runs first in app.ts) as pino-http's correlation id, so there is exactly
 * one place a request ID is minted.
 */
export function createHttpLogger(): HttpLogger {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as { requestId?: string }).requestId ?? '',
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
