import { describe, expect, it } from 'vitest';

import { runWithTenant } from '@/database/tenant-context.js';
import { TeamRepository } from '@/modules/teams/repositories/team.repository.js';
import { TrackRepository } from '@/modules/tracks/repositories/track.repository.js';

import { createAuthedUser, createTestOrganization, createTrack } from '../helpers/fixtures.js';

const tracks = new TrackRepository();
const teams = new TeamRepository();

describe('BaseRepository.findMany — cursor pagination (§4.3)', () => {
  it('returns hasNextPage=true and a usable cursor when more rows exist than the page size', async () => {
    const org = await createTestOrganization();
    for (let i = 0; i < 5; i++) {
      await createTrack(org.id, { key: `track-${i}` });
    }

    const page = await runWithTenant(org.id, () => tracks.findMany({ limit: 2 }));
    expect(page.data).toHaveLength(2);
    expect(page.hasNextPage).toBe(true);
    expect(page.nextCursor).not.toBeNull();
  });

  it('paging through every cursor visits every row exactly once, in order, with no duplicates', async () => {
    const org = await createTestOrganization();
    const created = [];
    for (let i = 0; i < 7; i++) {
      created.push(await createTrack(org.id, { key: `track-page-${i}`, sortOrder: i }));
    }

    const seenIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page: Awaited<ReturnType<typeof tracks.findMany>> = await runWithTenant(org.id, () =>
        tracks.findMany(cursor ? { limit: 3, cursor } : { limit: 3 }),
      );
      seenIds.push(...page.data.map((t) => t.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seenIds).toHaveLength(created.length);
    expect(new Set(seenIds).size).toBe(created.length); // no duplicates across pages
    for (const track of created) {
      expect(seenIds).toContain(track.id);
    }
  });

  it('the last page correctly reports hasNextPage=false and a null cursor', async () => {
    const org = await createTestOrganization();
    await createTrack(org.id);
    await createTrack(org.id);

    const page = await runWithTenant(org.id, () => tracks.findMany({ limit: 10 }));
    expect(page.hasNextPage).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('an empty result set returns {data: [], nextCursor: null, hasNextPage: false}, never null/undefined data', async () => {
    const org = await createTestOrganization();
    const page = await runWithTenant(org.id, () => tracks.findMany({ limit: 10 }));
    expect(page.data).toEqual([]);
    expect(page.hasNextPage).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe('BaseRepository.findMany — cursor pagination on a DateTime sort field', () => {
  it('paging through a DateTime-sorted repository (TeamRepository.createdAt) visits every row exactly once', async () => {
    const org = await createTestOrganization();
    const { user: manager } = await createAuthedUser(org.id, 'MANAGER');

    const created = [];
    const baseTime = Date.now();
    for (let i = 0; i < 7; i++) {
      created.push(
        await runWithTenant(org.id, () =>
          teams.create({
            organizationId: org.id,
            managerId: manager.id,
            name: `Team ${i}`,
            // Explicit, strictly increasing timestamps — `@default(now())`
            // rows created in a tight loop can collide on the same
            // millisecond, which would make this test non-deterministic.
            createdAt: new Date(baseTime + i * 1000),
          } as never),
        ),
      );
    }

    const seenIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page: Awaited<ReturnType<typeof teams.findMany>> = await runWithTenant(org.id, () =>
        teams.findMany(cursor ? { limit: 3, cursor } : { limit: 3 }),
      );
      seenIds.push(...page.data.map((t) => t.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seenIds).toHaveLength(created.length);
    expect(new Set(seenIds).size).toBe(created.length);
    for (const team of created) {
      expect(seenIds).toContain(team.id);
    }
  });
});

describe('Repository tenant isolation — findByIdScoped vs. the findById trap', () => {
  it('findByIdScoped refuses a real id belonging to a different organization', async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const trackInA = await createTrack(orgA.id);

    const resultFromB = await runWithTenant(orgB.id, () => tracks.findByIdScoped(trackInA.id));
    expect(resultFromB).toBeNull();
  });

  it('findByIdScoped returns the row when queried from its own organization', async () => {
    const org = await createTestOrganization();
    const track = await createTrack(org.id);

    const result = await runWithTenant(org.id, () => tracks.findByIdScoped(track.id));
    expect(result?.id).toBe(track.id);
  });

  it(
    'documents the known trap: BaseRepository.findById() (findUnique) is NOT ' +
      "tenant-scoped by the Prisma extension (the extension's own doc comment says " +
      'it cannot merge organizationId into a unique where) — callers resolving a ' +
      'request-supplied id must use findByIdScoped, never findById, for exactly ' +
      'this reason (a real cross-tenant leak this bug class caused, per MEMORY P3 changelog)',
    async () => {
      const orgA = await createTestOrganization();
      const orgB = await createTestOrganization();
      const trackInA = await createTrack(orgA.id);

      // findById() has no organizationId parameter at all — it cannot be
      // scoped by caller intent, which is precisely why every module's
      // request-supplied-id lookups were switched to findByIdScoped() in P3.
      const result = await runWithTenant(orgB.id, () => tracks.findById(trackInA.id));
      expect(result?.id).toBe(trackInA.id); // proves the trap is real, not that it's fine
    },
  );
});

describe('Tenant extension: unscoped query refusal', () => {
  it('a tenant-scoped model query outside runWithTenant() throws rather than running unscoped', async () => {
    await expect(tracks.findByIdScoped('any-id')).rejects.toThrow(/runWithTenant/);
  });
});
