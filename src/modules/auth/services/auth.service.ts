import { ConflictError, UnauthorizedError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { encrypt } from '@/common/utils/encryption.js';
import { verifyPassword } from '@/common/utils/password-hash.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { portalInviteRepository } from '@/modules/invites/invites.module.js';
import { writeNotification } from '@/modules/notifications/notifications.module.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type { EntraSignInResult } from './msal.interfaces.js';
import { TokenService, type TokenPair } from './token.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Demo-login feature — fixed to these 3 specific pre-existing accounts, one
// per role, at the user's explicit request (not "any user with this role",
// these exact 3). To remove the whole demo-login feature, also revert:
// - this file's `signInAsDemoAccount()` method + `DemoRole`/`DEMO_ACCOUNT_IDS`
// - src/modules/auth/controllers/auth.controller.ts's `demoLogin()` handler
// - src/modules/auth/auth.routes.ts's `POST /demo-login` route
// - Trainer-Ai/lib/api/auth.ts's `demoLogin()` client function
// - Trainer-Ai/lib/portal/store/slices/auth.slice.ts's `demoSignIn` action
// - Trainer-Ai/lib/portal/viewmodels/auth-screens.vm.ts's onDemoSignIn* handlers
// - Trainer-Ai/components/portal/screens/SignIn.tsx's "Demo login" button block
// - Trainer-Ai/components/portal/PortalHost.tsx's onDemoSignIn* prop wiring
export type DemoRole = 'ADMIN' | 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR';
const DEMO_ACCOUNT_IDS: Record<DemoRole, string> = {
  ADMIN: 'rlp40lbu70pan7d7evte1fhf',
  DEPARTMENT_MANAGER: 'cu69xxy8z56hkj8j2p17vlhg',
  CONTENT_CREATOR: 'pswmbb0kdzu4tw5qel74o0er',
};

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  locale: string;
  /** DEPARTMENT_MANAGER only — populated by `getById` (backs `GET /auth/me`); empty on the sign-in paths, which don't need it. */
  managedDepartmentNames: string[];
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
   * Two very different provisioning paths, disambiguated by whether an
   * `inviteToken` round-tripped through the OAuth `state` (see
   * `PkceStoreService`/`AuthController.microsoftStart`):
   *
   * - **Invited** (MANAGER/CONTENT_MANAGER): the invite already pins the
   *   target `Organization` — org resolution does NOT go through
   *   `entraTenantId` matching here, because an invited user is explicitly
   *   allowed to accept from a *different* Microsoft tenant than the org's
   *   own (only the invite's `email` has to match the signing-in account's
   *   email, checked below). Matching by tenant in this branch would either
   *   fail to find the org or — worse — silently create a duplicate one.
   * - **Uninvited** (brand-new signup, no token): today's `entraTenantId`
   *   upsert-or-create logic, provisioning as `DEPARTMENT_MANAGER` — the
   *   least-privileged role, never elevated automatically (AU-04/AU-01: no
   *   sign-in path may hand out `ADMIN` without an explicit invite). An
   *   existing user (matched by `entraObjectId`, either path) never has
   *   their role re-derived on repeat sign-in; role is set once, at first
   *   provisioning, full stop.
   */
  async signInWithMicrosoft(
    result: EntraSignInResult,
    inviteToken?: string | null,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const invite = inviteToken
      ? await portalInviteRepository.findByTokenUnscoped(inviteToken)
      : null;

    if (invite) {
      if (invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
        throw new UnauthorizedError('This invitation is no longer valid');
      }
      if (invite.email.toLowerCase() !== result.claims.email.toLowerCase()) {
        throw new UnauthorizedError(
          'This invitation was sent to a different email address than the Microsoft account you signed in with',
        );
      }
    }

    const organizationId = invite
      ? invite.organizationId
      : await this.resolveOrCreateOrganizationByTenant(result.claims);

    const existingUser = await portalUserRepository.findByEntraObjectId(
      result.claims.entraObjectId,
    );

    const graphTokenCacheEncrypted = encrypt(result.serializedTokenCache);

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
            role: invite ? invite.role : 'DEPARTMENT_MANAGER',
            graphTokenCacheEncrypted,
            graphHomeAccountId: result.homeAccountId,
            lastLoginAt: new Date(),
          } as never),
    );

    if (!user.isActive) {
      throw new UnauthorizedError('This account has been deactivated');
    }

    if (invite && !existingUser) {
      await runWithTenant(organizationId, async () => {
        await portalInviteRepository.update(invite.id, {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedUserId: user.id,
        } as never);

        // Any team created with this invite still pending (see
        // `TeamService.resolvePendingManagerInviteId`) now has a real manager.
        const pendingTeams = await teamRepository.findByPendingManagerInvite(invite.id);
        await Promise.all(
          pendingTeams.map((team) =>
            teamRepository.update(team.id, {
              managerId: user.id,
              pendingManagerInviteId: null,
            } as never),
          ),
        );

        await writeNotification({
          organizationId,
          recipientPortalUserId: invite.invitedById,
          type: 'INVITE_ACCEPTED',
          entityType: 'PortalInvite',
          entityId: invite.id,
          titleEn: `${user.name} accepted their invite`,
          titleAr: `قبِل ${user.name} الدعوة`,
        });
      });
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
      orgId: organizationId,
      role: user.role,
      locale: user.locale,
    });

    return { user: toAuthenticatedUser(user, organizationId), tokens };
  }

  private async resolveOrCreateOrganizationByTenant(
    claims: EntraSignInResult['claims'],
  ): Promise<string> {
    let organization = await organizationRepository.findByEntraTenantId(claims.entraTenantId);
    if (!organization) {
      organization = await organizationRepository.create({
        entraTenantId: claims.entraTenantId,
        name: claims.organizationName,
      } as never);
    } else if (organization.name === organization.entraTenantId) {
      // Backfills orgs provisioned before the Graph `/organization` lookup existed —
      // `name` was seeded from `entraTenantId` as a placeholder (never a real display name).
      organization = await organizationRepository.update(organization.id, {
        name: claims.organizationName,
      } as never);
    }
    return organization.id;
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

  /**
   * Demo-only fast login — no password, mints a real token pair (refresh
   * token included, so the session keeps itself alive via the normal
   * refresh flow same as any other login, unlike a hand-issued short-lived
   * access token) for one of 3 fixed pre-existing accounts. Scoped to
   * exactly these 3 user ids so it can never be used to sign in as an
   * arbitrary account — there is no email/password/Entra check here at all,
   * this bypasses those deliberately.
   */
  async signInAsDemoAccount(
    role: DemoRole,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const userId = DEMO_ACCOUNT_IDS[role];
    const user = await portalUserRepository.findByIdUnscoped(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Demo account unavailable');
    }

    await runWithTenant(user.organizationId, () =>
      writeAuditLog({
        organizationId: user.organizationId,
        actorId: user.id,
        actorType: 'USER',
        action: 'auth.signin.demo',
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
    const authenticated = toAuthenticatedUser(user, user.organizationId);
    if (user.role !== 'DEPARTMENT_MANAGER') {
      return authenticated;
    }
    const teams = await teamRepository.findByManager(user.id);
    const names = await Promise.all(teams.map((t) => teamRepository.findDepartmentName(t.id)));
    return {
      ...authenticated,
      managedDepartmentNames: Array.from(new Set(names.filter((n): n is string => Boolean(n)))),
    };
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
    managedDepartmentNames: [],
  };
}
