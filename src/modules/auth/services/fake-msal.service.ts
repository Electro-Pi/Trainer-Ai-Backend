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

  /**
   * The round-tripped "code" may carry an optional `tenant` alongside
   * `email`. Every sign-in used to report the same hardcoded
   * `entraTenantId`, which made the uninvited-signup tests order-dependent:
   * that guard fires only for the FIRST signer of a tenant, so once any
   * earlier test had signed in, a later test asserting "the first signer
   * creates the org" got a 401 instead — correct behaviour, wrong premise.
   * Naming a tenant lets a test have one to itself, while tests that need
   * two users in the SAME tenant (the rejection case) still just pass the
   * same value. Omitting it keeps the original default for dev sign-ins.
   */
  async acquireTokenByCode(code: string, _codeVerifier: string): Promise<EntraSignInResult> {
    const decoded = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as {
      email?: string;
      tenant?: string;
    };
    const email = decoded.email ?? 'fake.manager@demo.local';
    const seed = email.split('@')[0] ?? 'fake-user';
    const tenant = decoded.tenant ?? 'fake-tenant';

    return Promise.resolve({
      claims: {
        entraTenantId: tenant,
        // Scoped to the tenant too — the same email in two tenants is two
        // distinct directory identities, and `entraObjectId` is what
        // `findByEntraObjectId` uses to recognise a returning user.
        entraObjectId: `fake-oid-${seed}.${tenant}`,
        email,
        name: seed,
        organizationName: 'Demo Organization',
        mfaSatisfied: true,
      },
      homeAccountId: `fake-oid-${seed}.${tenant}`,
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
