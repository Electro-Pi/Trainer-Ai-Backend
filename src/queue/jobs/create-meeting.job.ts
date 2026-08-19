import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { graphMeetingsService } from '@/integrations/microsoft/graph.meetings.js';
import { logger } from '@/logger/logger.service.js';
import { ExternalSessionRepository } from '@/modules/ai-trainer/repositories/external-session.repository.js';
import { SlideDeckRepository } from '@/modules/ai-trainer/repositories/slide-deck.repository.js';
import { AiTrainerClientService } from '@/modules/ai-trainer/services/ai-trainer-client.service.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { SessionRepository } from '@/modules/sessions/repositories/session.repository.js';
import { skillRepository } from '@/modules/skills/skills.module.js';
import { trainingPlanRepository } from '@/modules/training-plans/training-plans.module.js';

import { queueService } from '../queue-instance.js';
import type { QueuePayloads } from '../queues.js';

const sessions = new SessionRepository();
const slideDecks = new SlideDeckRepository();
const externalSessions = new ExternalSessionRepository();
const aiTrainerClient = new AiTrainerClientService();
const REMINDER_LEAD_TIME_MS = 60 * 60_000;

/**
 * `IV-01`, `IV-05` — creates the Teams meeting for a confirmed session,
 * restricted-lobby and agent-as-presenter (§7.5), then records the invite.
 * Idempotent by `jobId: meeting-create-<sessionId>` (enqueued in
 * `TrainingPlanService.confirm`) — retrying this job for the same session on
 * a queue retry never double-books, since it's keyed at the queue level, not
 * here.
 */
export async function processCreateMeetingJob(
  payload: QueuePayloads['meeting.create'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const session = await sessions.findByIdScoped(payload.sessionId);
    if (!session) {
      logger.warn({ sessionId: payload.sessionId }, 'create-meeting: session not found, skipping');
      return;
    }

    if (session.graphEventId) {
      logger.info(
        { sessionId: session.id },
        'create-meeting: session already has a meeting, skipping',
      );
      return;
    }

    const plan = await trainingPlanRepository.findByIdScoped(session.planId);
    const learner = await learnerRepository.findByIdScoped(session.learnerId);

    if (!plan || !learner) {
      logger.error(
        { sessionId: session.id, planId: session.planId, learnerId: session.learnerId },
        'create-meeting: plan or learner missing, notifying manager rather than a silent no-show',
      );
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'session.meeting_creation_failed',
        entityType: 'Session',
        entityId: session.id,
        after: { reason: 'plan_or_learner_not_found' },
      });
      return;
    }

    const meeting = await graphMeetingsService.createMeeting(plan.createdById, {
      subject: `Training session — ${learner.displayName}`,
      startDateTime: session.scheduledStart.toISOString(),
      endDateTime: session.scheduledEnd.toISOString(),
      attendeeEmails: [learner.email],
    });

    const updated = await sessions.recordMeetingCreated(session.id, session.learnerId, {
      graphEventId: meeting.id,
      joinUrl: meeting.joinWebUrl,
    });

    // `P8-10`, ARCHITECTURE §9.11 rule 6 — asks the AI Trainer service to join
    // the meeting via the same `POST /sessions/external` call the manual
    // ExternalSessionService.start() flow uses. Best-effort: a dispatch
    // failure marks the session and notifies the manager rather than
    // silently producing a no-show, but does not fail this job or undo the
    // meeting/invitation already created — the meeting is real on Graph
    // either way, and retrying the whole job would re-run the
    // (already-guarded, idempotent) steps above for nothing.
    try {
      const outcome = await outcomeRepository.findByIdScoped(session.primaryOutcomeId);
      if (!outcome?.skillId) {
        throw new Error('Session outcome has no linked skill — cannot resolve a slide deck');
      }

      const skill = await skillRepository.findByIdScoped(outcome.skillId);
      if (!skill) {
        throw new Error('Skill not found for session outcome');
      }

      const slideDeck = await slideDecks.findBySkillId(outcome.skillId);
      if (!slideDeck || slideDeck.status !== 'ready') {
        throw new Error(
          `No ready slide deck for skill ${outcome.skillId} (status: ${slideDeck?.status ?? 'missing'})`,
        );
      }

      const joinUrl = updated.joinUrl ?? meeting.joinWebUrl;
      const result = await aiTrainerClient.startExternalSession({
        user_id: learner.id,
        user_name: learner.displayName,
        user_role: learner.jobTitle ?? 'Learner',
        user_email: learner.email,
        slide_deck_id: slideDeck.aiDeckId,
        skill_name: skill.nameEn,
        meeting_url: joinUrl,
      });

      await externalSessions.create({
        id: result.id,
        organizationId: payload.organizationId,
        learnerId: learner.id,
        slideDeckId: slideDeck.id,
        skillName: skill.nameEn,
        userRole: learner.jobTitle ?? 'Learner',
        meetingUrl: joinUrl,
        status: result.status,
        dispatchError: result.dispatch_error,
      } as never);

      if (result.dispatch_error) {
        throw new Error(result.dispatch_error);
      }
    } catch (error) {
      logger.error(
        { sessionId: session.id, err: error },
        'create-meeting: AI Trainer dispatch failed, notifying manager',
      );
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'session.dispatch_failed',
        entityType: 'Session',
        entityId: session.id,
        after: { reason: error instanceof Error ? error.message : 'unknown' },
      });
    }

    const reminderDelayMs = session.scheduledStart.getTime() - REMINDER_LEAD_TIME_MS - Date.now();
    if (reminderDelayMs > 0) {
      await queueService.enqueue(
        'session.reminder',
        { sessionId: session.id, organizationId: payload.organizationId },
        { jobId: `session-reminder-${session.id}`, delayMs: reminderDelayMs },
      );
    }

    await writeAuditLog({
      organizationId: payload.organizationId,
      actorType: 'SYSTEM',
      action: 'session.meeting_created',
      entityType: 'Session',
      entityId: session.id,
      after: { graphEventId: meeting.id },
    });

    logger.info({ sessionId: session.id, graphEventId: meeting.id }, 'Meeting created');
  });
}
