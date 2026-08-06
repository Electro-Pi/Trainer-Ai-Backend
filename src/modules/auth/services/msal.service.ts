import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import type { AuthenticationResult } from '@azure/msal-node';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';

import { FakeMsalService } from './fake-msal.service.js';
import type { EntraSignInResult, IMsalService } from './msal.interfaces.js';

// `AU-01`/`AU-02` — Entra ID auth-code + PKCE. Scopes per ARCHITECTURE §7.1:
// directory read, calendar/meeting write (P7) and mail send (P9) are
// requested up front so the one Graph token cache issued here covers every
// later phase without a re-consent.
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read.All',
  'Calendars.ReadWrite',
  'OnlineMeetings.ReadWrite',
  'Mail.Send',
];

interface IdTokenClaims {
  tid?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  amr?: string[];
}

const cryptoProvider = new CryptoProvider();

function createMsalClient(): ConfidentialClientApplication {
  return new ConfidentialClientApplication({
    auth: {
      clientId: env.GRAPH_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}`,
      clientSecret: env.GRAPH_CLIENT_SECRET,
    },
  });
}

/** Detects the Conditional Access MFA claim in the ID token's `amr` (authentication methods reference). */
function extractMfaSatisfied(claims: IdTokenClaims): boolean {
  return claims.amr?.includes('mfa') ?? false;
}

/**
 * Real Entra ID implementation. Never constructed at module scope — MSAL
 * validates `clientId`/`clientSecret` in `ConfidentialClientApplication`'s
 * constructor and throws immediately if they're blank, which they are by
 * default (`GRAPH_PROVIDER=fake`, D-14). `RealMsalService` is only
 * instantiated once `container.ts`/the controller has already checked
 * `GRAPH_PROVIDER === 'real'`.
 */
export class RealMsalService implements IMsalService {
  private readonly client = createMsalClient();

  async createAuthCodeUrl(): Promise<{ url: string; state: string; codeVerifier: string }> {
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = cryptoProvider.createNewGuid();

    const url = await this.client.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: env.GRAPH_REDIRECT_URI,
      state,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    });

    return { url, state, codeVerifier: verifier };
  }

  async acquireTokenByCode(code: string, codeVerifier: string): Promise<EntraSignInResult> {
    let result: AuthenticationResult | null;
    try {
      result = await this.client.acquireTokenByCode({
        code,
        scopes: SCOPES,
        redirectUri: env.GRAPH_REDIRECT_URI,
        codeVerifier,
      });
    } catch (error) {
      throw new ExternalServiceError('Microsoft sign-in failed', error);
    }

    if (!result) {
      throw new ExternalServiceError('Microsoft sign-in returned no result');
    }

    const claims = result.idTokenClaims as IdTokenClaims;
    if (!claims.tid || !claims.oid) {
      throw new ExternalServiceError('Microsoft ID token missing tid/oid claims');
    }

    const email = claims.email ?? claims.preferred_username;
    if (!email) {
      throw new ExternalServiceError('Microsoft ID token missing email claim');
    }

    if (!result.account) {
      throw new ExternalServiceError('Microsoft sign-in returned no account');
    }

    return {
      claims: {
        entraTenantId: claims.tid,
        entraObjectId: claims.oid,
        email,
        name: claims.name ?? email,
        mfaSatisfied: extractMfaSatisfied(claims),
      },
      homeAccountId: result.account.homeAccountId,
      serializedTokenCache: this.client.getTokenCache().serialize(),
    };
  }

  async acquireGraphTokenSilent(
    homeAccountId: string,
    serializedTokenCache: string,
  ): Promise<string> {
    const client = createMsalClient();
    client.getTokenCache().deserialize(serializedTokenCache);

    const account = await client.getTokenCache().getAccountByHomeId(homeAccountId);
    if (!account) {
      throw new ExternalServiceError('No cached Microsoft account for this user');
    }

    let result: AuthenticationResult | null;
    try {
      result = await client.acquireTokenSilent({ account, scopes: SCOPES });
    } catch (error) {
      throw new ExternalServiceError('Failed to refresh Microsoft Graph token', error);
    }

    if (!result?.accessToken) {
      throw new ExternalServiceError('Microsoft token refresh returned no access token');
    }

    return result.accessToken;
  }
}

let cachedInstance: IMsalService | undefined;

/** Selects real vs. fake by `env.GRAPH_PROVIDER`, same switch `container.ts` uses for the Graph client (§4.5). */
export function createMsalService(): IMsalService {
  cachedInstance ??= env.GRAPH_PROVIDER === 'real' ? new RealMsalService() : new FakeMsalService();
  return cachedInstance;
}
