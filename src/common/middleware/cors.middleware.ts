import cors from 'cors';

import { env } from '@/config/env.js';

export function corsMiddleware() {
  const origins = env.CORS_ORIGINS;

  return cors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });
}
