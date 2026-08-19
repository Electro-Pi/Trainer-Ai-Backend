import { randomUUID } from 'node:crypto';

import type { PortalRole } from '@prisma/client';

import { resetAllRateLimits } from '@/common/middleware/rate-limit.middleware.js';
import { encrypt } from '@/common/utils/encryption.js';
import { signAccessToken } from '@/common/utils/jwt.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

/**
 * `rateLimitMiddleware()`/`strictRateLimitMiddleware()` (P2-9) key by IP with
 * a fixed window in an in-memory store — every request from Supertest shares
 * one loopback IP, so a test file making more than 20 auth calls trips the
 * real limiter. That's correct production behavior, not a bug; tests that
 * need many auth calls in one file should reset these counters in
 * `beforeEach` instead of the app weakening the limit for "test mode".
 */
export async function resetRateLimits(): Promise<void> {
  resetAllRateLimits();
}

/**
 * Every test gets its own fresh `Organization` — cheaper and more faithful
 * to the tenant-isolation model (§7.3) than wrapping each HTTP round trip in
 * a rolled-back transaction, and it's exactly the isolation boundary the app
 * itself enforces. Nothing here needs cleanup between tests: a new org id
 * means a new tenant-scoped island every time.
 */
export async function createTestOrganization(name = 'Test Org'): Promise<{ id: string }> {
  return prisma.organization.create({
    data: { name: `${name} ${randomUUID()}`, defaultLanguage: 'EN' },
  });
}

export async function createPortalUser(
  organizationId: string,
  overrides: Partial<{ email: string; name: string; role: PortalRole }> = {},
) {
  return runWithTenant(organizationId, () =>
    prisma.portalUser.create({
      data: {
        organizationId,
        email: overrides.email ?? `${randomUUID()}@test.local`,
        name: overrides.name ?? 'Test User',
        role: overrides.role ?? 'DEPARTMENT_MANAGER',
      },
    }),
  );
}

export async function mintAccessToken(user: {
  id: string;
  organizationId: string;
  role: string;
  locale?: string;
}): Promise<string> {
  return signAccessToken({
    sub: user.id,
    orgId: user.organizationId,
    role: user.role,
    locale: user.locale ?? 'EN',
  });
}

/** Convenience: create a portal user of the given role and mint its bearer token in one call. */
export async function createAuthedUser(organizationId: string, role: PortalRole) {
  const user = await createPortalUser(organizationId, { role });
  const token = await mintAccessToken(user);
  return { user, token, authHeader: `Bearer ${token}` };
}

/**
 * Stamps a fake Graph token cache onto a portal user, mirroring what
 * `AuthService.signInWithMicrosoft` writes after a real Entra callback
 * (`graphHomeAccountId`/`graphTokenCacheEncrypted`). Needed for any test that
 * exercises a flow resolving the *acting user's own* cached Graph token
 * (`graph.meetings.ts`, directory search) — a portal user created directly
 * via Prisma, as `createPortalUser` does, never goes through that callback.
 */
export async function grantFakeGraphSession(organizationId: string, userId: string): Promise<void> {
  await runWithTenant(organizationId, () =>
    prisma.portalUser.update({
      where: { id: userId },
      data: {
        graphHomeAccountId: `fake-oid-${userId}.fake-tenant`,
        graphTokenCacheEncrypted: encrypt(JSON.stringify({ fake: true })),
      },
    }),
  );
}

/**
 * `Department` isn't a tenant-scoped model on the Prisma extension
 * (ARCHITECTURE §7.3 — it carries no `organizationId`-filtered auto-scoping),
 * so it's created directly rather than through `runWithTenant`, same as
 * `createTestOrganization`.
 */
export async function createDepartment(organizationId: string, name = 'Sales') {
  return prisma.department.create({
    data: { organizationId, name: `${name} ${randomUUID()}` },
  });
}

export async function createTrack(
  organizationId: string,
  overrides: Partial<{ key: string; sortOrder: number; departmentId: string }> = {},
) {
  const departmentId = overrides.departmentId ?? (await createDepartment(organizationId)).id;

  return runWithTenant(organizationId, () =>
    prisma.track.create({
      data: {
        organizationId,
        key: overrides.key ?? `track-${randomUUID()}`,
        nameEn: 'Sales',
        nameAr: 'المبيعات',
        descriptionEn: 'Sales track',
        descriptionAr: 'مسار المبيعات',
        departmentId,
        targetSkills: ['discovery'],
        trainingForm: 'CONVERSATION',
        impactIndicators: ['closed deals'],
        ...(overrides.sortOrder !== undefined ? { sortOrder: overrides.sortOrder } : {}),
      },
    }),
  );
}

export async function createLevel(
  trackId: string,
  organizationId: string,
  overrides: Partial<{ order: number; key: string }> = {},
) {
  return runWithTenant(organizationId, () =>
    prisma.level.create({
      data: {
        trackId,
        key: overrides.key ?? `level-${randomUUID()}`,
        nameEn: 'Beginner',
        nameAr: 'مبتدئ',
        descriptionEn: 'Beginner level',
        descriptionAr: 'مستوى مبتدئ',
        order: overrides.order ?? 0,
      },
    }),
  );
}

export async function createOutcome(
  levelId: string,
  organizationId: string,
  overrides: Partial<{ order: number }> = {},
) {
  return runWithTenant(organizationId, () =>
    prisma.outcome.create({
      data: {
        levelId,
        titleEn: 'Discovery calls',
        titleAr: 'مكالمات الاستكشاف',
        targetSkills: ['listening'],
        order: overrides.order ?? 0,
      },
    }),
  );
}

export async function createTeam(
  organizationId: string,
  managerId: string,
  name = 'Test Team',
  departmentId?: string,
) {
  const resolvedDepartmentId = departmentId ?? (await createDepartment(organizationId)).id;
  return runWithTenant(organizationId, () =>
    prisma.team.create({
      data: { organizationId, managerId, name, departmentId: resolvedDepartmentId },
    }),
  );
}

export async function createLearner(
  organizationId: string,
  teamId: string,
  overrides: Partial<{ email: string; displayName: string; entraObjectId: string }> = {},
) {
  return runWithTenant(organizationId, () =>
    prisma.learner.create({
      data: {
        organizationId,
        teamId,
        entraObjectId: overrides.entraObjectId ?? `entra-${randomUUID()}`,
        email: overrides.email ?? `${randomUUID()}@learner.test.local`,
        displayName: overrides.displayName ?? 'Test Learner',
        jobTitle: 'Account Executive',
      },
    }),
  );
}

/** A full track→level→outcome tree in one call, for tests that just need a valid catalogue target. */
export async function createCatalogueTree(organizationId: string) {
  const track = await createTrack(organizationId);
  const level = await createLevel(track.id, organizationId);
  const outcome = await createOutcome(level.id, organizationId);
  return { track, level, outcome };
}
