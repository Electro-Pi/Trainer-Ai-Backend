import { createHash, randomBytes } from 'node:crypto';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';
import { signAccessToken } from '@/common/utils/jwt.js';
import { env } from '@/config/env.js';
import { refreshTokenRepository } from '@/modules/users/users.module.js';
import type { JwtAccessClaims } from '@/shared-types.js';

const REFRESH_TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Opaque refresh token (30d, hashed at rest, rotated on every use) with
 * **family reuse-detection** (`AU-06`): each refresh token belongs to a
 * `familyId` fixed at login. Presenting a token that was already rotated
 * away (`revokedAt` set, meaning someone replayed a stolen/old token)
 * revokes the whole family — every descendant token from that login stops
 * working, forcing a fresh sign-in. Access-JWT sign/verify itself lives in
 * `common/utils/jwt.ts` (pure, no repository dependency).
 */
export class TokenService {
  /** Issues the first token of a new family — called only at login, not on rotation. */
  async issueTokenPair(userId: string, claims: JwtAccessClaims): Promise<TokenPair> {
    const familyId = randomBytes(16).toString('hex');
    return this.issuePairInFamily(userId, claims, familyId, null);
  }

  /**
   * Verifies and rotates a presented refresh token. Reuse (an already-
   * rotated or revoked token presented again) revokes the entire family and
   * throws — the caller must force the user to sign in again.
   *
   * `resolveClaims` is called with the token's owning `userId` (recovered
   * from the stored row, not trusted from the caller) so `AuthService` can
   * re-read the current `PortalUser` row for fresh role/locale without this
   * class taking a dependency on the `users` repository beyond refresh
   * tokens themselves.
   */
  async rotateRefreshToken(
    presentedToken: string,
    resolveClaims: (userId: string) => Promise<JwtAccessClaims>,
  ): Promise<TokenPair> {
    const tokenHash = hashToken(presentedToken);
    const stored = await refreshTokenRepository.findByTokenHash(tokenHash);

    if (!stored) {
      throw new UnauthorizedError('Unknown refresh token');
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      await refreshTokenRepository.revokeFamily(stored.familyId);
      throw new UnauthorizedError('Refresh token reuse detected — session revoked');
    }

    const claims = await resolveClaims(stored.userId);
    return this.issuePairInFamily(stored.userId, claims, stored.familyId, stored.id);
  }

  async revokeRefreshToken(presentedToken: string): Promise<void> {
    const stored = await refreshTokenRepository.findByTokenHash(hashToken(presentedToken));
    if (stored) {
      await refreshTokenRepository.revokeFamily(stored.familyId);
    }
  }

  private async issuePairInFamily(
    userId: string,
    claims: JwtAccessClaims,
    familyId: string,
    replacesId: string | null,
  ): Promise<TokenPair> {
    const accessToken = await signAccessToken(claims);

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + parseTtlToMs(env.JWT_REFRESH_TTL));

    const created = await refreshTokenRepository.create({
      userId,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt,
    } as never);

    if (replacesId) {
      await refreshTokenRepository.update(replacesId, {
        revokedAt: new Date(),
        replacedById: created.id,
      } as never);
    }

    return { accessToken, refreshToken };
  }
}

/** `env.JWT_REFRESH_TTL` is a duration string like `30d`/`15m` — jose has no standalone parser, so this covers the unit set actually used in `env.ts`'s schema. */
function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Unsupported TTL format: ${ttl}`);
  }
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * (unitMs[match[2]] as number);
}
