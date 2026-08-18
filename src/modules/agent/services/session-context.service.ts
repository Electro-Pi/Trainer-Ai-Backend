import { NotFoundError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';
import {
  questionBankRepository,
  questionRepository,
  rubricCriterionRepository,
  rubricRepository,
} from '@/modules/assessments/assessments.module.js';
import {
  contentItemRepository,
  mediaAssetRepository,
  mediaService,
} from '@/modules/content/content.module.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import type { Session } from '@/modules/sessions/sessions.module.js';
import {
  sessionContentRepository,
  sessionOutcomeRepository,
  sessionRepository,
} from '@/modules/sessions/sessions.module.js';

import type {
  SessionContextContentItem,
  SessionContextMedia,
  SessionContextOutcome,
  SessionContextQuestion,
  SessionContextResponse,
  SessionContextRubric,
} from '../dto/agent.dto.js';

/**
 * `P8-3` — the single most important read in the Agent Session API
 * (ARCHITECTURE §9.11: "if that payload is incomplete, their side cannot
 * meet its requirements"). Resolves by `joinToken`, never by session id
 * (`IV-04`) — the token IS the auth for this call, checked by
 * `SessionRepository.findByJoinToken`'s two-step unscoped→scoped resolve
 * (P7's deliberate exception to "every query is pre-scoped").
 */
export class SessionContextService {
  async getByJoinToken(joinToken: string): Promise<SessionContextResponse> {
    const session = await sessionRepository.findByJoinToken(joinToken);
    if (!session) {
      throw new NotFoundError('Unknown or expired session token');
    }

    return runWithTenant(session.organizationId, () => this.assemble(session));
  }

  private async assemble(session: Session): Promise<SessionContextResponse> {
    const learner = await learnerRepository.findByIdScoped(session.learnerId);
    if (!learner) {
      throw new NotFoundError('Learner not found for this session');
    }

    const primaryOutcome = await outcomeRepository.findByIdScoped(session.primaryOutcomeId);
    if (!primaryOutcome) {
      throw new NotFoundError('Primary outcome not found for this session');
    }
    const resolvedLevel = await levelRepository.findByIdScoped(primaryOutcome.levelId);
    if (!resolvedLevel) {
      throw new NotFoundError('Level not found for this session');
    }

    const sessionOutcomes = await sessionOutcomeRepository.findBySession(session.id);
    const outcomeIds = sessionOutcomes.map((so) => so.outcomeId);
    const outcomes = await Promise.all(
      outcomeIds.map((id) => outcomeRepository.findByIdScoped(id)),
    );

    const outcomesPayload: SessionContextOutcome[] = [];
    for (const [index, so] of sessionOutcomes.entries()) {
      const outcome = outcomes[index];
      if (!outcome) continue;
      outcomesPayload.push({
        id: outcome.id,
        titleEn: outcome.titleEn,
        titleAr: outcome.titleAr,
        descriptionEn: outcome.descriptionEn,
        descriptionAr: outcome.descriptionAr,
        targetSkills: outcome.targetSkills,
        isCarriedOver: so.isCarriedOver,
        priority: so.isCarriedOver ? 1 : 0,
      });
    }

    const contentPayload = await this.assembleContent(session.id);

    const questionBank = await questionBankRepository.findByOutcomeAndLanguage(
      primaryOutcome.id,
      learner.preferredLanguage,
    );
    const questions: SessionContextQuestion[] = questionBank
      ? (await questionRepository.findByQuestionBank(questionBank.id)).map((q) => ({
          id: q.id,
          outcomeId: primaryOutcome.id,
          prompt: q.prompt,
          difficulty: q.difficulty,
          expectedAnswer: q.expectedAnswer,
          modelAnswer: q.modelAnswer,
        }))
      : [];

    const rubric = await rubricRepository.findActiveByOutcome(primaryOutcome.id);
    const rubricPayload: SessionContextRubric | null = rubric
      ? {
          id: rubric.id,
          name: rubric.name,
          passThreshold: rubric.passThreshold,
          criteria: (await rubricCriterionRepository.findByRubric(rubric.id)).map((c) => ({
            id: c.id,
            label: c.label,
            description: c.description,
            weight: c.weight,
          })),
        }
      : null;

    return {
      sessionId: session.id,
      status: session.status,
      language: learner.preferredLanguage,
      learner: {
        id: learner.id,
        displayName: learner.displayName,
        jobTitle: learner.jobTitle,
        departmentId: learner.departmentId,
      },
      level: { id: resolvedLevel.id, nameEn: resolvedLevel.nameEn, nameAr: resolvedLevel.nameAr },
      outcomes: outcomesPayload,
      content: contentPayload,
      questions,
      rubric: rubricPayload,
    };
  }

  private async assembleContent(sessionId: string): Promise<SessionContextContentItem[]> {
    const sessionContents = await sessionContentRepository.findBySession(sessionId);
    if (sessionContents.length === 0) return [];

    const contentItems = await contentItemRepository.findManyByIdsScoped(
      sessionContents.map((sc) => sc.contentItemId),
    );
    const contentById = new Map(contentItems.map((ci) => [ci.id, ci]));

    const results: SessionContextContentItem[] = [];
    for (const sc of sessionContents) {
      const item = contentById.get(sc.contentItemId);
      if (!item) continue;

      const mediaAssets = await mediaAssetRepository.findByContentItem(item.id);
      const media: SessionContextMedia[] = await Promise.all(
        mediaAssets
          .filter((asset) => asset.scanStatus === 'CLEAN')
          .map(async (asset) => ({
            id: asset.id,
            mimeType: asset.mimeType,
            url: await mediaService.getDownloadUrl(asset.id),
            pageCount: asset.pageCount,
            caption: asset.caption,
            altTextEn: asset.altTextEn,
            altTextAr: asset.altTextAr,
          })),
      );

      results.push({
        sessionContentId: sc.id,
        contentItemId: item.id,
        order: sc.order,
        title: item.title,
        contentType: item.contentType,
        textBody: item.textBody,
        sourceUrl: item.sourceUrl,
        source: sc.source,
        deliveredAt: sc.deliveredAt?.toISOString() ?? null,
        media,
      });
    }

    return results;
  }
}
