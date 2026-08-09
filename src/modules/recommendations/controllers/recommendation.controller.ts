import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type {
  RecommendationItemActionDto,
  RecommendationResponseDto,
} from '../dto/recommendation.dto.js';
import { type ActingUser, ConfirmationService } from '../services/confirmation.service.js';
import type { GenerateRecommendationResult } from '../services/recommendation.service.js';
import { RecommendationService } from '../services/recommendation.service.js';

const generator = new RecommendationService();
const confirmation = new ConfirmationService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(
  recommendation:
    | GenerateRecommendationResult['recommendation']
    | Awaited<ReturnType<ConfirmationService['getById']>>['recommendation'],
  items:
    | GenerateRecommendationResult['items']
    | Awaited<ReturnType<ConfirmationService['getById']>>['items'],
  coverageGaps: GenerateRecommendationResult['coverageGaps'] = [],
): RecommendationResponseDto {
  return {
    id: recommendation.id,
    learnerId: recommendation.learnerId,
    assignmentId: recommendation.assignmentId,
    sessionId: recommendation.sessionId,
    trigger: recommendation.trigger,
    status: recommendation.status,
    generatedAt: recommendation.generatedAt.toISOString(),
    confirmedAt: recommendation.confirmedAt?.toISOString() ?? null,
    confirmedById: recommendation.confirmedById,
    items: items.map((item) => ({
      id: item.id,
      contentItemId: item.contentItemId,
      outcomeId: item.outcomeId,
      rank: item.rank,
      score: item.score,
      reasonCode: item.reasonCode,
      reasonEn: item.reasonEn,
      reasonAr: item.reasonAr,
      signalBreakdown: item.signalBreakdown as Record<string, number>,
      status: item.status,
    })),
    coverageGaps,
  };
}

export class RecommendationController {
  /** `RC-16` — `POST /learners/:id/recommendations` generates a fresh `MANUAL` proposal. */
  async generate(req: Request, res: Response): Promise<void> {
    const { id: learnerId } = req.params as { id: string };
    const result = await generator.generateManual(req.auth!.orgId, learnerId);
    res.status(201).json(toResponseDto(result.recommendation, result.items, result.coverageGaps));
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { recommendation, items } = await confirmation.getById(id);
    res.status(200).json(toResponseDto(recommendation, items));
  }

  async confirm(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { recommendation, items } = await confirmation.confirm(toActingUser(req.auth!), id);
    res.status(200).json(toResponseDto(recommendation, items));
  }

  async applyItemAction(req: Request, res: Response): Promise<void> {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const dto = req.body as RecommendationItemActionDto;
    const item = await confirmation.applyItemAction(toActingUser(req.auth!), id, itemId, dto);
    res.status(200).json({
      id: item.id,
      contentItemId: item.contentItemId,
      outcomeId: item.outcomeId,
      rank: item.rank,
      score: item.score,
      reasonCode: item.reasonCode,
      reasonEn: item.reasonEn,
      reasonAr: item.reasonAr,
      signalBreakdown: item.signalBreakdown as Record<string, number>,
      status: item.status,
    });
  }
}
