import { PkceEntryRepository } from '../repositories/pkce-entry.repository.js';

const TTL_SECONDS = 600;

/**
 * Server-side store for the PKCE code verifier between `/auth/microsoft/start`
 * and `/auth/microsoft/callback` — the two legs of Entra's auth-code flow run
 * as separate requests, so the verifier can't just live in a closure. Keyed
 * by `state` (also CSRF-mitigating per MSAL's own `validateState`), 10-minute
 * TTL matches a generous login-page dwell time. Backed by Postgres (`PkceEntry`)
 * rather than Redis — expired rows are swept by the nightly `cleanup` job, and
 * `consume` re-checks `expiresAt` so a slow sweep can't resurrect a stale entry.
 */
export class PkceStoreService {
  private readonly pkceEntries = new PkceEntryRepository();

  async save(state: string, codeVerifier: string, inviteToken?: string): Promise<void> {
    await this.pkceEntries.upsert(
      state,
      codeVerifier,
      new Date(Date.now() + TTL_SECONDS * 1000),
      inviteToken,
    );
  }

  async consume(
    state: string,
  ): Promise<{ codeVerifier: string; inviteToken: string | null } | null> {
    const entry = await this.pkceEntries.consume(state);
    if (!entry || entry.expiresAt < new Date()) return null;
    return { codeVerifier: entry.codeVerifier, inviteToken: entry.inviteToken };
  }
}
