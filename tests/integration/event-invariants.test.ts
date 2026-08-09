import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

import {
  createAuthedUser,
  createCatalogueTree,
  createLearner,
  createTeam,
  createTestOrganization,
} from '../helpers/fixtures.js';

const app = createApp();

/**
 * `P11-7b` — event + cleanup invariants (§4.4). The `cleanup.job` half of
 * this task (§10.1's "by-products only, never records" guarantee) has no
 * processor yet — `cleanup` is only a typed queue name in `queues.ts`
 * (P12-3b's job, still TODO per BUILD_PLAN). That invariant is deliberately
 * deferred rather than tested against code that doesn't exist yet; this file
 * covers the event half, which is real today.
 */
describe('Event invariant: a rolled-back transaction publishes no event', () => {
  it('assigning a learner to a non-existent level fails before the transaction, and publishes nothing', async () => {
    const org = await createTestOrganization();
    const { user: manager, authHeader } = await createAuthedUser(org.id, 'MANAGER');
    const team = await createTeam(org.id, manager.id);
    const learner = await createLearner(org.id, team.id);
    const { track } = await createCatalogueTree(org.id);

    const res = await request(app)
      .post(`/api/v1/learners/${learner.id}/assignment`)
      .set('Authorization', authHeader)
      // Syntactically valid cuid2 shape (passes Zod) that references no real
      // row — this exercises `LearnerAssignmentService.assign`'s own
      // "level not found" check, not Zod's format check, so it genuinely
      // proves the service-level rejection path publishes nothing.
      .send({ trackId: track.id, levelId: 'ckv8x2j9w0000gzuc9j8w5g5m' });

    expect(res.status).toBe(422);

    const assignments = await runWithTenant(org.id, () =>
      prisma.learnerAssignment.findMany({ where: { learnerId: learner.id } }),
    );
    expect(assignments).toHaveLength(0);

    const recommendations = await runWithTenant(org.id, () =>
      prisma.recommendation.findMany({ where: { learnerId: learner.id } }),
    );
    expect(recommendations).toHaveLength(0);
  });

  it('a successful assignment DOES publish and produce a recommendation (control case, proving the test can detect a real publish)', async () => {
    const org = await createTestOrganization();
    const { user: manager, authHeader } = await createAuthedUser(org.id, 'MANAGER');
    const team = await createTeam(org.id, manager.id);
    const learner = await createLearner(org.id, team.id);
    const { track, level } = await createCatalogueTree(org.id);

    const res = await request(app)
      .post(`/api/v1/learners/${learner.id}/assignment`)
      .set('Authorization', authHeader)
      .send({ trackId: track.id, levelId: level.id });
    expect(res.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const recommendations = await runWithTenant(org.id, () =>
      prisma.recommendation.findMany({
        where: { learnerId: learner.id, trigger: 'LEVEL_ASSIGNED' },
      }),
    );
    expect(recommendations.length).toBeGreaterThan(0);
  });
});
