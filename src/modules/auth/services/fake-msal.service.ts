import { randomBytes } from 'node:crypto';

import type { EntraSignInResult, IMsalService } from './msal.interfaces.js';

/**
 * Deterministic dev/test default (D-14) — no Azure app registration needed
 * to exercise the full sign-in flow. `createAuthCodeUrl`'s "code" is a
 * base64 JSON blob the fake round-trips itself in `acquireTokenByCode`,
 * so `/auth/microsoft/start` → `/auth/microsoft/callback` works without a
 * real Microsoft redirect in between.
 */
export class FakeMsalService implements IMsalService {
  async createAuthCodeUrl(): Promise<{ url: string; state: string; codeVerifier: string }> {
    const state = randomBytes(16).toString('hex');
    const codeVerifier = randomBytes(32).toString('base64url');
    const fakeCode = Buffer.from(JSON.stringify({ email: 'fake.manager@demo.local' })).toString(
      'base64url',
    );
    return Promise.resolve({
      url: `about:blank?fake-microsoft-signin&code=${fakeCode}&state=${state}`,
      state,
      codeVerifier,
    });
  }

  async acquireTokenByCode(code: string, _codeVerifier: string): Promise<EntraSignInResult> {
    const decoded = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as {
      email?: string;
    };
    const email = decoded.email ?? 'fake.manager@demo.local';
    const seed = email.split('@')[0] ?? 'fake-user';

    return Promise.resolve({
      claims: {
        entraTenantId: 'fake-tenant',
        entraObjectId: `fake-oid-${seed}`,
        email,
        name: seed,
        mfaSatisfied: true,
      },
      homeAccountId: `fake-oid-${seed}.fake-tenant`,
      serializedTokenCache: JSON.stringify({ fake: true }),
    });
  }

  async acquireGraphTokenSilent(
    homeAccountId: string,
    _serializedTokenCache: string,
  ): Promise<string> {
    return Promise.resolve(`fake-graph-token.${homeAccountId}`);
  }
}
