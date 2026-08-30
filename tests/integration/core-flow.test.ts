import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app.js';
import { env } from '@/config/env.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { processCreateMeetingJob } from '@/queue/jobs/create-meeting.job.js';
import { processGenerateReportJob } from '@/queue/jobs/generate-report.job.js';
import { processSendReportJob } from '@/queue/jobs/send-report.job.js';

import {
  createAuthedUser,
  createDepartment,
  createTestOrganization,
  grantFakeGraphSession,
  resetRateLimits,
} from '../helpers/fixtures.js';

const app = createApp();

// `send-report.job.ts` fetches the generated PDF back over a real HTTP
// request to its UploadThing signed download URL rather than reading local
// disk directly — so this one test needs a real listening server on
// `APP_URL`'s port, not just an in-memory Express app handed to supertest.
// `env.APP_URL` is always set (by tests/setup/test-env.ts) to an explicit
// port, so no fallback default is needed here — a missing port would be a
// test-harness misconfiguration worth failing loudly on, not silently
// defaulting past.
const appUrlPort = Number(new URL(env.APP_URL).port);
let server: import('node:http').Server;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server = app.listen(appUrlPort, '127.0.0.1');
    server.once('listening', resolve);
    server.once('error', reject);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/**
 * `P11-6` — the full spine of the product, end to end, entirely on fakes
 * (`GRAPH_PROVIDER`/`AI_SERVICE_PROVIDER`/`EMAIL_PROVIDER` all default
 * `fake` in `tests/setup/test-env.ts`): a manager builds a catalogue, assigns
 * a learner to a level (auto-triggers a recommendation), confirms it into a
 * plan, confirms the plan (creates a real-on-the-fake Teams meeting), runs a
 * full agent session (context -> answers -> complete), and verifies the
 * outcome updates, carry-over, and generated report.
 *
 * Job processors are invoked directly rather than through a live worker
 * process — the queue *transport* (enqueue/retry/backoff) is P0's
 * concern and isn't what this test is proving; this test proves the business
 * logic each processor runs is correct when it fires.
 */
describe('core flow: assignment -> recommendation -> plan -> meeting -> session -> outcomes -> report', () => {
  it('runs the whole spine correctly on one seeded learner', async () => {
    await resetRateLimits();

    const org = await createTestOrganization('Core Flow Org');
    const { user: manager, authHeader: managerAuth } = await createAuthedUser(
      org.id,
      'DEPARTMENT_MANAGER',
    );
    await grantFakeGraphSession(org.id, manager.id);
    const { authHeader: contentAuth } = await createAuthedUser(org.id, 'CONTENT_CREATOR');
    const department = await createDepartment(org.id);

    // ── Catalogue: track -> level -> two outcomes ──────────────────────
    const trackRes = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', contentAuth)
      .send({
        key: 'sales',
        nameEn: 'Sales',
        nameAr: 'المبيعات',
        descriptionEn: 'Sales track',
        descriptionAr: 'مسار المبيعات',
        departmentId: department.id,
        targetSkills: ['discovery'],
        trainingForm: 'CONVERSATION',
        impactIndicators: ['closed deals'],
      });
    expect(trackRes.status).toBe(201);
    const trackId = trackRes.body.id as string;

    const levelRes = await request(app)
      .post(`/api/v1/tracks/${trackId}/levels`)
      .set('Authorization', contentAuth)
      .send({
        key: 'beginner',
        nameEn: 'Beginner',
        nameAr: 'مبتدئ',
        descriptionEn: 'Beginner level',
        descriptionAr: 'مستوى مبتدئ',
      });
    expect(levelRes.status).toBe(201);
    const levelId = levelRes.body.id as string;

    const skillRes = await request(app)
      .post(`/api/v1/levels/${levelId}/skills`)
      .set('Authorization', contentAuth)
      .send({
        key: 'discovery-calls',
        nameEn: 'Discovery Calls',
        nameAr: 'مكالمات الاستكشاف',
        descriptionEn: 'Running an effective discovery call',
        descriptionAr: 'إجراء مكالمة استكشاف فعالة',
        levels: ['Beginner'],
      });
    expect(skillRes.status).toBe(201);
    const skillId = skillRes.body.id as string;

    const outcomeRes = await request(app)
      .post(`/api/v1/levels/${levelId}/outcomes`)
      .set('Authorization', contentAuth)
      .send({
        titleEn: 'Discovery calls',
        titleAr: 'مكالمات الاستكشاف',
        targetSkills: ['listening'],
        trainingForm: 'CONVERSATION',
        skillId,
      });
    expect(outcomeRes.status).toBe(201);
    const outcomeId = outcomeRes.body.id as string;

    // ── Content: one document scoped to the skill ───────────────────────
    const contentRes = await request(app)
      .post('/api/v1/content')
      .set('Authorization', contentAuth)
      .send({
        skillId,
        name: 'Open Discovery Questions.pdf',
      });
    expect(contentRes.status).toBe(201);
    const contentItemId = contentRes.body.id as string;

    // ── Question bank + rubric on the outcome (needed for a scorable session) ──
    const rubricRes = await request(app)
      .put(`/api/v1/outcomes/${outcomeId}/rubric`)
      .set('Authorization', contentAuth)
      .send({
        name: 'Discovery Rubric',
        passThreshold: 60,
        criteria: [{ label: 'Asks open questions', description: 'Open, not closed', weight: 100 }],
      });
    expect(rubricRes.status).toBe(200);
    const criterionId = rubricRes.body.criteria[0].id as string;

    // ── Team + learner ───────────────────────────────────────────────
    const teamRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', managerAuth)
      .send({ name: 'Cairo Sales Team', departmentId: department.id });
    expect(teamRes.status).toBe(201);
    const teamId = teamRes.body.id as string;

    const importRes = await request(app)
      .post(`/api/v1/teams/${teamId}/members`)
      .set('Authorization', managerAuth)
      .send({
        learners: [
          {
            entraObjectId: 'core-flow-learner-1',
            email: 'sara@core-flow.test.local',
            displayName: 'Sara Ahmed',
          },
        ],
      });
    expect(importRes.status).toBe(201);
    const learnerId = importRes.body.imported[0].id as string;

    // ── Assignment -> auto-triggers a LEVEL_ASSIGNED recommendation (RC-01) ──
    const assignRes = await request(app)
      .post(`/api/v1/learners/${learnerId}/assignment`)
      .set('Authorization', managerAuth)
      .send({ trackId, levelId });
    expect(assignRes.status).toBe(201);

    // The event subscriber runs asynchronously off `EventBus.subscribe`'s
    // `Promise.resolve().then()` continuation (P0) — give it a tick to land
    // before asserting on the recommendation it produces.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const recommendation = await runWithTenant(org.id, () =>
      prisma.recommendation.findFirst({
        where: { learnerId, trigger: 'LEVEL_ASSIGNED' },
        include: { items: true },
      }),
    );
    expect(recommendation).not.toBeNull();
    expect(recommendation!.status).toBe('PROPOSED');
    expect(recommendation!.items.length).toBeGreaterThan(0);
    expect(recommendation!.items[0]!.contentItemId).toBe(contentItemId);

    // ── Confirm the recommendation (RC-06: nothing reaches a plan unconfirmed) ──
    const confirmRecRes = await request(app)
      .post(`/api/v1/recommendations/${recommendation!.id}/confirm`)
      .set('Authorization', managerAuth);
    expect(confirmRecRes.status).toBe(200);
    expect(confirmRecRes.body.status).toBe('CONFIRMED');

    // A second confirm must be rejected — the invariant is enforced, not just documented.
    const doubleConfirmRes = await request(app)
      .post(`/api/v1/recommendations/${recommendation!.id}/confirm`)
      .set('Authorization', managerAuth);
    expect(doubleConfirmRes.status).toBe(409);

    // ── Training plan: create -> suggest -> coverage -> confirm ─────────
    const planRes = await request(app)
      .post('/api/v1/plans')
      .set('Authorization', managerAuth)
      .send({
        learnerId,
        trainingDays: 1,
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.id as string;

    const suggestRes = await request(app)
      .post(`/api/v1/plans/${planId}/suggest`)
      .set('Authorization', managerAuth)
      .send({});
    expect(suggestRes.status).toBe(200);

    const coverageRes = await request(app)
      .get(`/api/v1/plans/${planId}/coverage`)
      .set('Authorization', managerAuth);
    expect(coverageRes.status).toBe(200);
    expect(coverageRes.body.gaps ?? []).toHaveLength(0);

    const confirmPlanRes = await request(app)
      .post(`/api/v1/plans/${planId}/confirm`)
      .set('Authorization', managerAuth);
    expect(confirmPlanRes.status).toBe(200);

    const sessionBeforeMeeting = await runWithTenant(org.id, () =>
      prisma.session.findFirstOrThrow({ where: { planId } }),
    );
    expect(sessionBeforeMeeting.status).toBe('SCHEDULED');

    // ── Meeting creation (P7-5, IV-01) — invoke the real processor directly ──
    await processCreateMeetingJob({ sessionId: sessionBeforeMeeting.id, organizationId: org.id });

    const sessionAfterMeeting = await runWithTenant(org.id, () =>
      prisma.session.findFirstOrThrow({ where: { id: sessionBeforeMeeting.id } }),
    );
    expect(sessionAfterMeeting.status).toBe('INVITED');
    expect(sessionAfterMeeting.graphEventId).toBeTruthy();
    expect(sessionAfterMeeting.joinToken).toBeTruthy();

    // ── Agent session: context -> start -> answer -> complete (P8, on FakeLlmService's shape) ──
    const serviceHeaders = { 'x-service-token': env.AI_SERVICE_TOKEN };

    const contextRes = await request(app)
      .get(`/api/v1/agent/sessions/${sessionAfterMeeting.joinToken}/context`)
      .set(serviceHeaders);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body.learner.id).toBe(learnerId);
    expect(contextRes.body.content.length).toBeGreaterThan(0);
    expect(contextRes.body.rubric.criteria[0].id).toBe(criterionId);

    const startRes = await request(app)
      .post(`/api/v1/agent/sessions/${sessionAfterMeeting.id}/start`)
      .set(serviceHeaders);
    expect(startRes.status).toBe(200);

    const answerRes = await request(app)
      .post(`/api/v1/agent/sessions/${sessionAfterMeeting.id}/answers`)
      .set(serviceHeaders)
      .send({
        outcomeId,
        questionText: 'What is the first question you would ask?',
        answerText: 'An open question about their current goals.',
        score: 90,
        maxScore: 100,
        criterionScores: [
          { criterionId, score: 90, maxScore: 100, judgement: 'Asked a clear open question.' },
        ],
      });
    expect(answerRes.status).toBe(201);

    const completeRes = await request(app)
      .post(`/api/v1/agent/sessions/${sessionAfterMeeting.id}/complete`)
      .set(serviceHeaders)
      .send({});
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.verdict).toBe('ACHIEVED');

    // ── Outcome tracking updated (OT-01) ─────────────────────────────
    const learnerOutcome = await runWithTenant(org.id, () =>
      prisma.learnerOutcome.findFirstOrThrow({ where: { learnerId, outcomeId } }),
    );
    expect(learnerOutcome.status).toBe('ACHIEVED');
    expect(learnerOutcome.achievedAt).not.toBeNull();

    // ── session.completed handlers fired: one PENDING Report row per
    // recipient (learner + manager), not one shared row (P8-8b) ──
    await new Promise((resolve) => setTimeout(resolve, 200));
    const pendingReports = await runWithTenant(org.id, () =>
      prisma.report.findMany({ where: { sessionId: sessionAfterMeeting.id } }),
    );
    expect(pendingReports).toHaveLength(2);
    for (const report of pendingReports) {
      expect(report.status).toBe('PENDING');
    }

    // ── Report generation + send (P9) — invoke the real processors directly, once per recipient's report ──
    for (const report of pendingReports) {
      await processGenerateReportJob({ reportId: report.id, organizationId: org.id });
      await processSendReportJob({ reportId: report.id, organizationId: org.id });
    }

    const sentReports = await runWithTenant(org.id, () =>
      prisma.report.findMany({ where: { sessionId: sessionAfterMeeting.id } }),
    );
    expect(sentReports).toHaveLength(2);
    for (const report of sentReports) {
      expect(report.status).toBe('SENT');
      expect(report.blobKey).toBeTruthy();
    }

    // ── Reports visible via the manager-facing API (PF-05's drill-down target) ──
    const reportsListRes = await request(app)
      .get('/api/v1/reports')
      .query({ sessionId: sessionAfterMeeting.id })
      .set('Authorization', managerAuth);
    expect(reportsListRes.status).toBe(200);
    // One row per session, not per recipient. A completed session writes two
    // `Report` rows (learner + manager — asserted above at the DB level) whose
    // emailed PDFs genuinely differ, but they share a score, verdict and date,
    // so listing both rendered every session twice with visually identical
    // rows. The list collapses them; the detail page serves both audiences as
    // tabs from the surviving id.
    expect(reportsListRes.body.data).toHaveLength(1);
    expect(reportsListRes.body.data[0].status).toBe('SENT');
    expect(reportsListRes.body.data[0].sessionId).toBe(sessionAfterMeeting.id);
    expect(reportsListRes.body.pageInfo).toMatchObject({ page: 1, total: 1, totalPages: 1 });

    void manager;
  });
});
