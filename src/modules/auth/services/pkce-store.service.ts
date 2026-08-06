import { Redis } from 'ioredis';

import { env } from '@/config/env.js';

const KEY_PREFIX = 'auth:pkce:';
const TTL_SECONDS = 600;

interface PkceEntry {
  codeVerifier: string;
}

/**
 * Server-side store for the PKCE code verifier between `/auth/microsoft/start`
 * and `/auth/microsoft/callback` — the two legs of Entra's auth-code flow run
 * as separate requests, so the verifier can't just live in a closure. Keyed
 * by `state` (also CSRF-mitigating per MSAL's own `validateState`), 10-minute
 * TTL matches a generous login-page dwell time.
 */
export class PkceStoreService {
  private readonly redis = new Redis(env.REDIS_URL);

  async save(state: string, codeVerifier: string): Promise<void> {
    await this.redis.set(
      `${KEY_PREFIX}${state}`,
      JSON.stringify({ codeVerifier } satisfies PkceEntry),
      'EX',
      TTL_SECONDS,
    );
  }

  async consume(state: string): Promise<string | null> {
    const key = `${KEY_PREFIX}${state}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return (JSON.parse(raw) as PkceEntry).codeVerifier;
  }
}
