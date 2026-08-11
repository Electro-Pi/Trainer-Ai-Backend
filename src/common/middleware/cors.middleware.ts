import cors from 'cors';

import { env } from '@/config/env.js';

export function corsMiddleware() {
  const origins = env.CORS_ORIGINS;

  if (origins.length === 0) {
    if (env.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGINS must be set in production');
    }
    return cors({ origin: true, credentials: true });
  }

  return cors({
    origin: origins,
    credentials: true,
  });
}
