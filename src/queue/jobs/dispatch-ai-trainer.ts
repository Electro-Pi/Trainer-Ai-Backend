import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { logger } from '@/logger/logger.service.js';
import { ExternalSessionRepository } from '@/modules/ai-trainer/repositories/external-session.repository.js';
import { SlideDeckRepository } from '@/modules/ai-trainer/repositories/slide-deck.repository.js';
import { AiTrainerClientService } from '@/modules/ai-trainer/services/ai-trainer-client.service.js';
import type { Learner } from '@/modules/learners/learners.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import type { Session } from '@/modules/sessions/repositories/session.repository.js';
import { SessionRepository } from '@/modules/sessions/repositories/session.repository.js';
import { skillRepository } from '@/modules/skills/skills.module.js';

const sessions = new SessionRepository();
const slideDecks = new SlideDeckRepository();
const externalSessions = new ExternalSessionRepository();
const aiTrainerClient = new AiTrainerClientService();

/**
 * `POST /sessions/external` dispatch, shared by `create-meeting.job.ts`
 * (first dispatch, on session creation) and `meeting-update.job.ts`
 * (re-dispatch, on reschedule — a session already dispatched once was still
 * only ever told about its *original* time/join link; without calling this
 * again on reschedule, the AI Trainer keeps working from a stale meeting
 * reference). Always creates a brand-new `ExternalSession` row and re-points
 * `Session.externalSessionId` at it — the AI Trainer service has no "update"
 * endpoint for an existing external session, only "start a new one".
 *
 * Best-effort by design (matches the original inline version in
 * `create-meeting.job.ts`): a dispatch failure never throws back to the
 * caller — it's logged and audited, but the meeting/email steps around it
 * must not be undone or retried just because the agent side failed.
 */
export async function dispatchToAiTrainer(params: {
  organizationId: string;
  session: Session;
  learner: Learner;
  joinUrl: string;
}): Promise<void> {
  const { organizationId, session, learner, joinUrl } = params;
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
      organizationId,
      learnerId: learner.id,
      slideDeckId: slideDeck.id,
      skillName: skill.nameEn,
      userRole: learner.jobTitle ?? 'Learner',
      meetingUrl: joinUrl,
      status: result.status,
      dispatchError: result.dispatch_error,
    } as never);
    await sessions.recordExternalSessionId(session.id, result.id);

    if (result.dispatch_error) {
      throw new Error(result.dispatch_error);
    }
  } catch (error) {
    logger.error(
      { sessionId: session.id, err: error },
      'dispatch-ai-trainer: dispatch failed, notifying manager',
    );
    await writeAuditLog({
      organizationId,
      actorType: 'SYSTEM',
      action: 'session.dispatch_failed',
      entityType: 'Session',
      entityId: session.id,
      after: { reason: error instanceof Error ? error.message : 'unknown' },
    });
  }
}
