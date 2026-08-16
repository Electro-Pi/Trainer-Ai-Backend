import { ConflictError, UnauthorizedError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { encrypt } from '@/common/utils/encryption.js';
import { verifyPassword } from '@/common/utils/password-hash.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type { EntraSignInResult } from './msal.interfaces.js';
import { TokenService, type TokenPair } from './token.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  locale: string;
}

/**
 * Orchestrates the two sign-in paths (`AU-01` Entra, `AU-07` password
 * fallback) into one place: resolve/upsert the tenant and user rows, then
 * hand off to `TokenService` for our own JWT/refresh pair. Kept out of the
 * controller so it stays unit-testable without an HTTP layer.
 */
export class AuthService {
  private readonly tokens = new TokenService();

  /**
   * Upserts `Organization` by `tid` and `PortalUser` by `oid` (ARCHITECTURE
   * §7.1). A brand-new user is provisioned as `MANAGER` — the lowest-
   * privilege portal role — and an ADMIN promotes them afterward via the
   * `users` module; nothing here silently grants elevated access.
   */
  async signInWithMicrosoft(
    result: EntraSignInResult,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    let organization = await organizationRepository.findByEntraTenantId(
      result.claims.entraTenantId,
    );
    if (!organization) {
      organization = await organizationRepository.create({
        entraTenantId: result.claims.entraTenantId,
        name: result.claims.organizationName,
      } as never);
    } else if (organization.name === organization.entraTenantId) {
      // Backfills orgs provisioned before the Graph `/organization` lookup existed —
      // `name` was seeded from `entraTenantId` as a placeholder (never a real display name).
      organization = await organizationRepository.update(organization.id, {
        name: result.claims.organizationName,
      } as never);
    }

    const existingUser = await portalUserRepository.findByEntraObjectId(
      result.claims.entraObjectId,
    );

    const graphTokenCacheEncrypted = encrypt(result.serializedTokenCache);
    const organizationId = organization.id;

    const user = await runWithTenant(organizationId, () =>
      existingUser
        ? portalUserRepository.update(existingUser.id, {
            graphTokenCacheEncrypted,
            graphHomeAccountId: result.homeAccountId,
            lastLoginAt: new Date(),
          } as never)
        : portalUserRepository.create({
            organizationId,
            entraObjectId: result.claims.entraObjectId,
            email: result.claims.email,
            name: result.claims.name,
            role: 'MANAGER',
            graphTokenCacheEncrypted,
            graphHomeAccountId: result.homeAccountId,
            lastLoginAt: new Date(),
          } as never),
    );

    if (!user.isActive) {
      throw new UnauthorizedError('This account has been deactivated');
    }

    await runWithTenant(organizationId, () =>
      writeAuditLog({
        organizationId,
        actorId: user.id,
        actorType: 'USER',
        action: 'auth.signin.microsoft',
        entityType: 'PortalUser',
        entityId: user.id,
      }),
    );

    const tokens = await this.tokens.issueTokenPair(user.id, {
      sub: user.id,
      orgId: organization.id,
      role: user.role,
      locale: user.locale,
    });

    return { user: toAuthenticatedUser(user, organization.id), tokens };
  }

  /**
   * Generic failure message on every rejection path (unknown email, wrong
   * password, locked account) — `AU-07` requires no signal that
   * distinguishes "wrong password" from "no such account". Tracks
   * `failedLoginCount`/`lockedUntil` on the row it just read.
   */
  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const user = await portalUserRepository.findByEmail(email);

    if (!user?.passwordHash || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValid = await verifyPassword(user.passwordHash, password);

    if (!isValid) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
      await runWithTenant(user.organizationId, () =>
        portalUserRepository.update(user.id, { failedLoginCount, lockedUntil } as never),
      );
      throw new UnauthorizedError('Invalid email or password');
    }

    await runWithTenant(user.organizationId, () =>
      portalUserRepository.update(user.id, { failedLoginCount: 0, lockedUntil: null } as never),
    );

    await runWithTenant(user.organizationId, () =>
      writeAuditLog({
        organizationId: user.organizationId,
        actorId: user.id,
        actorType: 'USER',
        action: 'auth.signin.password',
        entityType: 'PortalUser',
        entityId: user.id,
      }),
    );

    const tokens = await this.tokens.issueTokenPair(user.id, {
      sub: user.id,
      orgId: user.organizationId,
      role: user.role,
      locale: user.locale,
    });

    return { user: toAuthenticatedUser(user, user.organizationId), tokens };
  }

  /** No `req.auth` exists yet at this point (that's what refresh produces) — resolves the owning user unscoped. */
  async refresh(presentedRefreshToken: string): Promise<TokenPair> {
    return this.tokens.rotateRefreshToken(presentedRefreshToken, async (userId) => {
      const user = await portalUserRepository.findByIdUnscoped(userId);
      if (!user || !user.isActive) {
        throw new ConflictError('Account no longer active');
      }
      return { sub: user.id, orgId: user.organizationId, role: user.role, locale: user.locale };
    });
  }

  async logout(presentedRefreshToken: string): Promise<void> {
    await this.tokens.revokeRefreshToken(presentedRefreshToken);
  }

  /** Called from `GET /auth/me`, which runs `tenantScope()` after `authenticate()` — a tenant context is already active. */
  async getById(userId: string): Promise<AuthenticatedUser> {
    const user = await portalUserRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }
    return toAuthenticatedUser(user, user.organizationId);
  }
}

function toAuthenticatedUser(
  user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: string;
    locale: string;
  },
  organizationId: string,
): AuthenticatedUser {
  return {
    id: user.id,
    organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
  };
}
