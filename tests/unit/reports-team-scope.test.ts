import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MODRB-15 — an Accounting manager saw org-wide reports, including learners
 * from other departments.
 *
 * `tenantScope()` narrows to the organization, never to the team, and
 * `requireTeamAccess` can't protect a collection (no single id to resolve),
 * so `GET /reports` had no ownership filter at all. These assert the exact
 * `where` clause reaching Prisma, since that is what decides which rows the
 * manager can actually see.
 */

const findMany = vi.fn().mockResolvedValue([]);

vi.mock('@/database/prisma.service.js', () => ({
  prisma: { report: { findMany } },
}));

const { ReportRepository } = await import('@/modules/reports/repositories/report.repository.js');
const repo = new ReportRepository();

const ACCOUNTING = 'team-accounting';

function whereArg() {
  return findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
}

beforeEach(() => {
  findMany.mockClear();
});

describe('MODRB-15 — manager sees only their own team', () => {
  it('restricts the query to the manager’s teams', async () => {
    await repo.list({ teamIds: [ACCOUNTING] });

    expect(whereArg()).toMatchObject({
      OR: [
        { session: { learner: { teamId: { in: [ACCOUNTING] } } } },
        { plan: { learner: { teamId: { in: [ACCOUNTING] } } } },
      ],
    });
  });

  it('covers PLAN_SUMMARY reports too, which reach the learner via plan', async () => {
    // A SESSION report joins through `session`; a PLAN_SUMMARY through
    // `plan`. Filtering only one would leak the other.
    await repo.list({ teamIds: [ACCOUNTING] });
    const or = whereArg()['OR'] as Array<Record<string, unknown>>;

    expect(or).toHaveLength(2);
    expect(Object.keys(or[0]!)[0]).toBe('session');
    expect(Object.keys(or[1]!)[0]).toBe('plan');
  });

  it('scopes a multi-team manager to all of their teams, and no others', async () => {
    await repo.list({ teamIds: ['team-a', 'team-b'] });
    const or = whereArg()['OR'] as Array<never>;

    expect(JSON.stringify(or)).toContain('team-a');
    expect(JSON.stringify(or)).toContain('team-b');
  });

  it('returns nothing for a manager with no teams — never everything', async () => {
    // The dangerous collapse: treating [] as "unscoped" would hand back the
    // whole organization.
    await repo.list({ teamIds: [] });

    expect(whereArg()['OR']).toBeDefined();
    expect(JSON.stringify(whereArg())).toContain('"in":[]');
  });
});

describe('MODRB-15 — admin keeps org-wide access', () => {
  it('applies no team filter when the scope is undefined', async () => {
    await repo.list({});
    expect(whereArg()['OR']).toBeUndefined();
  });

  it('still honours the caller’s own filters alongside the team scope', async () => {
    await repo.list({ status: 'SENT', teamIds: [ACCOUNTING] });

    expect(whereArg()).toMatchObject({ status: 'SENT' });
    expect(whereArg()['OR']).toBeDefined();
  });
});
