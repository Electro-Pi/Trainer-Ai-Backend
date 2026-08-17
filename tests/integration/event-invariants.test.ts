import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { processCleanupJob } from '@/queue/jobs/cleanup.job.js';

import {
  createAuthedUser,
  createCatalogueTree,
  createLearner,
  createTeam,
  createTestOrganization,
} from '../helpers/fixtures.js';

const app = createApp();

/**
 * `P11-7b` — event + cleanup invariants (§4.4). `cleanup.job` now exists
 * (P12-3b), so this file covers both halves: the event-publish invariant
 * above, and the hard boundary below — `cleanup` must never touch `Report`,
 * `Learner`, `ContentItem`, `Session` or `Assessment` (§10.1).
 */
describe('Event invariant: a rolled-back transaction publishes no event', () => {
  it('assigning a learner to a non-existent level fails before the transaction, and publishes nothing', async () => {
    const org = await createTestOrganization();
    const { user: manager, authHeader } = await createAuthedUser(org.id, 'DEPARTMENT_MANAGER');
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
    const { user: manager, authHeader } = await createAuthedUser(org.id, 'DEPARTMENT_MANAGER');
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

describe('cleanup.job invariant: the hard boundary is never crossed', () => {
  it('leaves Report, Learner, ContentItem, Session and Assessment completely untouched, even when every sweep has real work to do', async () => {
    const org = await createTestOrganization();
    const { user: manager } = await createAuthedUser(org.id, 'DEPARTMENT_MANAGER');
    const team = await createTeam(org.id, manager.id);
    const learner = await createLearner(org.id, team.id);
    const { track, level, outcome } = await createCatalogueTree(org.id);

    const longExpiredDate = new Date('2000-01-01T00:00:00.000Z');

    const seeded = await runWithTenant(org.id, async () => {
      const assignment = await prisma.learnerAssignment.create({
        data: {
          learnerId: learner.id,
          trackId: track.id,
          levelId: level.id,
          assignedById: manager.id,
        },
      });

      const plan = await prisma.trainingPlan.create({
        data: {
          organizationId: org.id,
          learnerId: learner.id,
          assignmentId: assignment.id,
          title: 'Cleanup invariant plan',
          trainingDays: 1,
          startDate: longExpiredDate,
          endDate: longExpiredDate,
          createdById: manager.id,
        },
      });

      const session = await prisma.session.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          learnerId: learner.id,
          primaryOutcomeId: outcome.id,
          sequence: 1,
          scheduledStart: longExpiredDate,
          scheduledEnd: longExpiredDate,
          durationMinutes: 30,
          joinToken: `cleanup-invariant-${randomUUID()}`,
        },
      });

      // Deliberately past every retention window this sweep applies, so a
      // buggy cleanup that ignored the hard boundary would visibly fail this
      // test rather than silently passing because nothing was ever eligible.
      const assessment = await prisma.assessment.create({
        data: {
          sessionId: session.id,
          totalScore: 80,
          verdict: 'ACHIEVED',
          strengths: 'Clear communication',
          gaps: 'None noted',
          agentNotes: 'Strong session',
          transcriptUrl: `transcripts/${session.id}.txt`,
          transcriptRetentionUntil: longExpiredDate,
          recordingConsentAt: longExpiredDate,
        },
      });

      const contentItem = await prisma.contentItem.create({
        data: {
          organizationId: org.id,
          title: 'Cleanup invariant content',
          trackId: track.id,
          levelId: level.id,
          contentType: 'TEXT',
          textBody: 'Body',
          language: 'EN',
          estimatedMinutes: 5,
          difficulty: 'EASY',
          createdById: manager.id,
        },
      });

      const report = await prisma.report.create({
        data: {
          organizationId: org.id,
          sessionId: session.id,
          type: 'SESSION',
          language: 'EN',
          status: 'GENERATED',
          blobKey: `reports/${session.id}.pdf`,
          generatedAt: longExpiredDate,
          recipients: [],
          createdAt: longExpiredDate,
        },
      });

      return { session, assessment, contentItem, report };
    });

    const readAll = () =>
      runWithTenant(org.id, async () => {
        const [reportRow, learnerRow, contentItemRow, sessionRow] = await Promise.all([
          prisma.report.findUnique({ where: { id: seeded.report.id } }),
          prisma.learner.findUnique({ where: { id: learner.id } }),
          prisma.contentItem.findUnique({ where: { id: seeded.contentItem.id } }),
          prisma.session.findUnique({ where: { id: seeded.session.id } }),
        ]);
        // `Assessment` isn't in `TENANT_SCOPED_MODELS` (reached via Session),
        // so its `findUnique` runs unscoped like any non-tenant-scoped model —
        // still safe to call inside `runWithTenant`, just doesn't need it.
        const assessmentRow = await prisma.assessment.findUnique({
          where: { id: seeded.assessment.id },
        });
        return {
          reportRow,
          learnerRow,
          contentItemRow,
          sessionRow,
          assessmentRow,
        };
      });

    const {
      reportRow: reportBefore,
      learnerRow: learnerBefore,
      contentItemRow: contentItemBefore,
      sessionRow: sessionBefore,
      assessmentRow: assessmentBefore,
    } = await readAll();

    await processCleanupJob({ organizationId: org.id });

    const {
      reportRow: reportAfter,
      learnerRow: learnerAfter,
      contentItemRow: contentItemAfter,
      sessionRow: sessionAfter,
      assessmentRow: assessmentAfter,
    } = await readAll();

    // Rows survive at all — the primary "never deleted" assertion.
    expect(reportAfter).not.toBeNull();
    expect(learnerAfter).not.toBeNull();
    expect(contentItemAfter).not.toBeNull();
    expect(sessionAfter).not.toBeNull();
    expect(assessmentAfter).not.toBeNull();

    // Field-level: `Report`, `Learner`, `ContentItem` and `Session` must see
    // no mutation at all. `Assessment` is the one sanctioned exception —
    // §10.1 requires `cleanup` to clear `transcriptUrl`/`transcriptRetentionUntil`
    // in place once the transcript's retention window has passed, while the
    // row (and every other field on it) survives untouched. This is the
    // assertion that would catch a boundary check applied to the wrong table.
    expect(reportAfter).toEqual(reportBefore);
    expect(learnerAfter).toEqual(learnerBefore);
    expect(contentItemAfter).toEqual(contentItemBefore);
    expect(sessionAfter).toEqual(sessionBefore);
    expect(assessmentAfter).toEqual({
      ...assessmentBefore,
      transcriptUrl: null,
      transcriptRetentionUntil: null,
    });
  });

  it('DOES sweep by-products in the same run (control case, proving the job ran and did real work)', async () => {
    const org = await createTestOrganization();
    const { user } = await createAuthedUser(org.id, 'DEPARTMENT_MANAGER');

    const longExpiredDate = new Date('2000-01-01T00:00:00.000Z');
    const staleToken = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: `stale-${randomUUID()}`,
        familyId: randomUUID(),
        expiresAt: longExpiredDate,
      },
    });

    await processCleanupJob({ organizationId: org.id });

    const survived = await prisma.refreshToken.findUnique({ where: { id: staleToken.id } });
    expect(survived).toBeNull();
  });
});
