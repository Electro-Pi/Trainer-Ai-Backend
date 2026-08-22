import { runWithTenant } from '@/database/tenant-context.js';
import { eventBus } from '@/events/event-bus.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { RecommendationService } from '@/modules/recommendations/recommendations.module.js';
import { reportRepository } from '@/modules/reports/reports.module.js';
import { sessionRepository } from '@/modules/sessions/sessions.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';
import { queueService } from '@/queue/queue-instance.js';

export interface ReportRecipient {
  role: 'DEPARTMENT_MANAGER' | 'LEARNER';
  portalUserId?: string;
  email: string;
  name: string;
}

/**
 * `P8-8b`, ARCHITECTURE §4.3's own worked example — `session.completed`
 * fans out to independent effects. Each handler is registered separately
 * with `eventBus.subscribe`, which already isolates failures per-handler
 * (`event-bus.ts`'s `.catch()` — one throwing handler logs and stops, it
 * never takes down the request or its siblings). Explicitly re-enters
 * `runWithTenant` in every handler for the same reason `recommendations`'
 * `LEVEL_ASSIGNED` subscriber does: `EventBus.subscribe`'s
 * `Promise.resolve().then()` continuation isn't guaranteed to still be
 * inside the publishing request's `AsyncLocalStorage` frame.
 */
export function registerSessionCompletedHandlers(): void {
  // `RP-01`, `RP-02` — creates one `Report` row per distinct recipient
  // language among {manager, learner} ("one session can produce two PDFs",
  // ARCHITECTURE §9/P9's exit criterion) and enqueues generation for each.
  eventBus.subscribe('session.completed', async (payload) => {
    await runWithTenant(payload.organizationId, async () => {
      const session = await sessionRepository.findByIdScoped(payload.sessionId);
      if (!session) return;

      const learner = await learnerRepository.findByIdScoped(payload.learnerId);
      if (!learner) return;

      const team = await teamRepository.findByIdScoped(learner.teamId);
      const manager = team?.managerId
        ? await portalUserRepository.findByIdScoped(team.managerId)
        : null;

      const recipientsByLanguage = new Map<'EN' | 'AR', ReportRecipient[]>();
      const addRecipient = (language: 'EN' | 'AR', recipient: ReportRecipient): void => {
        const existing = recipientsByLanguage.get(language) ?? [];
        existing.push(recipient);
        recipientsByLanguage.set(language, existing);
      };

      addRecipient(learner.preferredLanguage, {
        role: 'LEARNER',
        email: learner.email,
        name: learner.displayName,
      });
      if (manager) {
        addRecipient(manager.locale, {
          role: 'DEPARTMENT_MANAGER',
          portalUserId: manager.id,
          email: manager.email,
          name: manager.name,
        });
      }

      for (const [language, recipients] of recipientsByLanguage) {
        const report = await reportRepository.create({
          organizationId: payload.organizationId,
          sessionId: payload.sessionId,
          planId: session.planId,
          type: 'SESSION',
          language,
          status: 'PENDING',
          recipients,
        } as never);

        await queueService.enqueue('report.generate', {
          reportId: report.id,
          organizationId: payload.organizationId,
        });
      }
    });
  });

  // `RC-08` — the `SESSION_ENDED` trigger produces remedial content for
  // unachieved outcomes plus the next session's set.
  eventBus.subscribe('session.completed', async (payload) => {
    await runWithTenant(payload.organizationId, async () => {
      await new RecommendationService().generate({
        organizationId: payload.organizationId,
        learnerId: payload.learnerId,
        trigger: 'SESSION_ENDED',
        sessionId: payload.sessionId,
      });
    });
  });
}

/**
 * `OT-05` escalation is published as its own event (`outcome.failed.repeatedly`,
 * distinct from `session.completed`) since it only fires for the subset of
 * outcomes that just crossed into a repeat failure — the complete-session
 * service publishes it directly per outcome rather than this handler
 * re-deriving which outcomes qualify from `session.completed` alone.
 */
export function registerOutcomeEscalationHandler(): void {
  eventBus.subscribe('outcome.failed.repeatedly', async (payload) => {
    await runWithTenant(payload.organizationId, async () => {
      await queueService.enqueue('outcome.escalate', {
        learnerId: payload.learnerId,
        organizationId: payload.organizationId,
        outcomeId: payload.outcomeId,
      });
    });
  });
}
