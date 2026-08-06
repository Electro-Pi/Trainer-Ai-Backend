export interface MicrosoftIdentityClaims {
  entraTenantId: string;
  entraObjectId: string;
  email: string;
  name: string;
  /** Present when Entra Conditional Access enforced MFA for this sign-in (AU-08). */
  mfaSatisfied: boolean;
}

export interface EntraSignInResult {
  claims: MicrosoftIdentityClaims;
  /** Looks up the cached account when a later phase adds Graph calls (P3 directory, P7 meetings, P9 mail). */
  homeAccountId: string;
  /**
   * MSAL's serialized token cache (accounts + refresh token), not a bare
   * token string — MSAL does not expose the raw refresh token by design.
   * Persisted encrypted (`common/utils/encryption.ts`) so a later phase can
   * feed it back through `deserialize()` + `acquireTokenSilent()` instead of
   * this class reverse-engineering a token out of MSAL's internal cache
   * schema.
   */
  serializedTokenCache: string;
}

/**
 * D-14 — every external dependency has a fake, and the fake is the dev/test
 * default. `MsalService` (real, `@azure/msal-node`) and `FakeMsalService`
 * both implement this so the whole Entra sign-in flow is demoable with zero
 * Azure app registration.
 */
export interface IMsalService {
  createAuthCodeUrl(): Promise<{ url: string; state: string; codeVerifier: string }>;
  acquireTokenByCode(code: string, codeVerifier: string): Promise<EntraSignInResult>;

  /**
   * `TM-01` — restores `serializedTokenCache` into a client and resolves a
   * fresh Graph access token for `homeAccountId` via `acquireTokenSilent()`,
   * refreshing behind the scenes if MSAL's cached token expired. The first
   * real caller of the pattern `EntraSignInResult`'s doc comment described.
   */
  acquireGraphTokenSilent(homeAccountId: string, serializedTokenCache: string): Promise<string>;
}
