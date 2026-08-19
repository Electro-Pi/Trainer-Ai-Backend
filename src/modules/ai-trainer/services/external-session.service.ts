import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { skillRepository } from '@/modules/skills/skills.module.js';

import type {
  ExternalSessionEvaluationResponseDto,
  ExternalSessionResponseDto,
  ExternalSessionStatusResponseDto,
  ExternalSessionTranscriptResponseDto,
  StartExternalSessionRequestDto,
} from '../dto/ai-trainer.dto.js';
import type { ExternalSession } from '../repositories/external-session.repository.js';
import { ExternalSessionRepository } from '../repositories/external-session.repository.js';
import { SlideDeckRepository } from '../repositories/slide-deck.repository.js';

import { AiTrainerClientService } from './ai-trainer-client.service.js';

export interface ActingUser {
  id: string;
  organizationId: string;
}

/**
 * `POST /external-sessions` + the 3 `GET /external-sessions/:id*` proxy
 * routes. Only `POST` writes our `ExternalSession` row (once, at creation —
 * per the confirmed decision, transcript/evaluation are never cached, and
 * `GET /:id` only opportunistically refreshes progress fields as a side
 * effect of a live status poll). Ownership on every `GET` is checked against
 * our own stored row (tenant-scoped `findByIdScoped`) before proxying to the
 * AI Trainer service, since the AI service itself has no concept of our
 * `organizationId`.
 */
export class ExternalSessionService {
  private readonly client = new AiTrainerClientService();
  private readonly sessions = new ExternalSessionRepository();
  private readonly slideDecks = new SlideDeckRepository();

  async start(
    actor: ActingUser,
    dto: StartExternalSessionRequestDto,
  ): Promise<ExternalSessionResponseDto> {
    const slideDeck = await this.slideDecks.findByIdScoped(dto.slideDeckId);
    if (!slideDeck) {
      throw new NotFoundError('Slide deck not found');
    }
    if (slideDeck.status !== 'ready') {
      throw new ConflictError(`Slide deck is not ready yet (status: ${slideDeck.status})`);
    }

    const learner = await learnerRepository.findByIdScoped(dto.learnerId);
    if (!learner) {
      throw new NotFoundError('Learner not found');
    }

    const skillName = await this.resolveSkillName(slideDeck.skillId);

    const result = await this.client.startExternalSession({
      user_id: learner.id,
      user_name: learner.displayName,
      user_role: learner.jobTitle ?? 'Learner',
      user_email: learner.email,
      slide_deck_id: slideDeck.aiDeckId,
      skill_name: skillName,
      meeting_url: dto.meetingUrl,
    });

    await this.sessions.create({
      id: result.id,
      organizationId: actor.organizationId,
      learnerId: learner.id,
      slideDeckId: slideDeck.id,
      skillName,
      userRole: learner.jobTitle ?? 'Learner',
      meetingUrl: dto.meetingUrl,
      status: result.status,
      dispatchError: result.dispatch_error,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'ai_trainer.external_session_started',
      entityType: 'ExternalSession',
      entityId: result.id,
      after: { learnerId: learner.id, slideDeckId: slideDeck.id },
    });

    return {
      id: result.id,
      channel: result.channel,
      status: result.status,
      meetingUrl: result.meeting_url,
      dispatchError: result.dispatch_error,
    };
  }

  async getStatus(id: string): Promise<ExternalSessionStatusResponseDto> {
    await this.requireOwnedSession(id);

    const status = await this.client.getSessionStatus(id);

    // Opportunistic cache refresh — never blocks the response on failure,
    // this endpoint's contract is "proxy live", the DB write is a side effect.
    await this.sessions
      .updateProgress(id, {
        status: status.status,
        currentSlideIndex: status.current_slide_index,
        maxSlideIndexReached: status.max_slide_index_reached,
        questionsRecorded: status.questions_recorded,
        startedAt: status.started_at ? new Date(status.started_at) : null,
        endedAt: status.ended_at ? new Date(status.ended_at) : null,
      })
      .catch(() => undefined);

    return {
      id: status.id,
      slideDeckId: status.slide_deck_id,
      userId: status.user_id,
      userName: status.user_name,
      userRole: status.user_role,
      userEmail: status.user_email,
      channel: status.channel,
      status: status.status,
      currentSlideIndex: status.current_slide_index,
      maxSlideIndexReached: status.max_slide_index_reached,
      questionsRecorded: status.questions_recorded,
      externalMeetingUrl: status.external_meeting_url,
      externalDispatchError: status.external_dispatch_error,
      startedAt: status.started_at,
      endedAt: status.ended_at,
      createdAt: status.created_at,
    };
  }

  async getTranscript(id: string): Promise<ExternalSessionTranscriptResponseDto> {
    await this.requireOwnedSession(id);

    const transcript = await this.client.getSessionTranscript(id);
    return {
      sessionId: transcript.session_id,
      status: transcript.status,
      turns: transcript.turns.map((turn) => ({
        turnIndex: turn.turn_index,
        speaker: turn.speaker,
        text: turn.text,
        occurredAt: turn.occurred_at,
      })),
    };
  }

  async getEvaluation(id: string): Promise<ExternalSessionEvaluationResponseDto> {
    await this.requireOwnedSession(id);

    const evaluation = await this.client.getSessionEvaluation(id);
    return {
      sessionId: evaluation.session_id,
      overallScore: evaluation.overall_score,
      passed: evaluation.passed,
      summaryFeedback: evaluation.summary_feedback,
      strengths: evaluation.strengths,
      areasForImprovement: evaluation.areas_for_improvement,
      questions: evaluation.questions.map((q) => ({
        questionIndex: q.question_index,
        questionText: q.question_text,
        traineeAnswerText: q.trainee_answer_text,
        isCorrect: q.is_correct,
        aiFeedback: q.ai_feedback,
        outcomeText: q.outcome_text,
      })),
      outcomeResults: evaluation.outcome_results.map((o) => ({
        outcome: o.outcome,
        questionsAsked: o.questions_asked,
        questionsCorrect: o.questions_correct,
        passed: o.passed,
      })),
    };
  }

  /** Tenant-scoped ownership check — `ExternalSession.id` is the AI service's own uuid, not ours, so this is the only gate keeping org B from polling org A's session. */
  private async requireOwnedSession(id: string): Promise<ExternalSession> {
    const session = await this.sessions.findByIdScoped(id);
    if (!session) {
      throw new NotFoundError('External session not found');
    }
    return session;
  }

  private async resolveSkillName(skillId: string): Promise<string> {
    const skill = await skillRepository.findByIdScoped(skillId);
    if (!skill) {
      throw new NotFoundError('Skill not found for this slide deck');
    }
    return skill.nameEn;
  }
}
