import { ConflictError, NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { eventBus } from '@/events/event-bus.js';
import { contentItemRepository } from '@/modules/content/content.module.js';

import type { RecommendationItemActionDto } from '../dto/recommendation.dto.js';
import type { RecommendationItem } from '../repositories/recommendation-item.repository.js';
import { RecommendationItemRepository } from '../repositories/recommendation-item.repository.js';
import { RecommendationRepository } from '../repositories/recommendation.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/**
 * `P6-9` — `RC-06`, `RC-15`. Nothing reaches a plan until the manager
 * confirms; per-item accept/replace/reorder/reject lets them adjust the
 * proposal first. Every action is audited individually (`RC-15`), and
 * `confirm()` itself is audited once more as the terminal decision.
 */
export class ConfirmationService {
  private readonly recommendations = new RecommendationRepository();
  private readonly items = new RecommendationItemRepository();

  /** Tenant scoping is enforced by `findByIdScoped` reading the active `runWithTenant` context — a mismatched org simply yields no row. */
  private async loadOwned(recommendationId: string) {
    const recommendation = await this.recommendations.findByIdScoped(recommendationId);
    if (!recommendation) {
      throw new NotFoundError('Recommendation not found');
    }
    return recommendation;
  }

  async getById(recommendationId: string) {
    const recommendation = await this.loadOwned(recommendationId);
    const items = await this.items.findByRecommendation(recommendation.id);
    return { recommendation, items };
  }

  /**
   * Applies one action to one item. `ACCEPT` is a no-op status confirm on the
   * item itself (the recommendation-level `confirm()` is what actually
   * commits); `REJECT` marks the item `REJECTED`; `REORDER` changes its
   * `rank`; `REPLACE` marks the original `OVERRIDDEN` and links it to a new
   * item created against the manager-supplied replacement content.
   */
  async applyItemAction(
    actor: ActingUser,
    recommendationId: string,
    itemId: string,
    action: RecommendationItemActionDto,
  ): Promise<RecommendationItem> {
    const recommendation = await this.loadOwned(recommendationId);
    if (recommendation.status !== 'PROPOSED') {
      throw new ConflictError('Recommendation is no longer PROPOSED — it cannot be edited');
    }

    const existingItems = await this.items.findByRecommendation(recommendation.id);
    const item = existingItems.find((candidate) => candidate.id === itemId);
    if (!item) {
      throw new NotFoundError('Recommendation item not found');
    }

    let updated: RecommendationItem;

    switch (action.action) {
      case 'ACCEPT':
        updated = item;
        break;

      case 'REJECT':
        updated = await this.items.update(item.id, { status: 'REJECTED' } as never);
        break;

      case 'REORDER': {
        if (action.rank === undefined) {
          throw new ValidationError([
            { path: 'rank', code: 'required', message: 'rank is required for a REORDER action' },
          ]);
        }
        updated = await this.items.update(item.id, { rank: action.rank } as never);
        break;
      }

      case 'REPLACE': {
        if (!action.replacementContentItemId) {
          throw new ValidationError([
            {
              path: 'replacementContentItemId',
              code: 'required',
              message: 'replacementContentItemId is required for a REPLACE action',
            },
          ]);
        }
        const replacement = await contentItemRepository.findByIdScoped(
          action.replacementContentItemId,
        );
        if (!replacement || replacement.status !== 'PUBLISHED') {
          throw new ValidationError([
            {
              path: 'replacementContentItemId',
              code: 'invalid',
              message: 'replacementContentItemId must reference a PUBLISHED content item',
            },
          ]);
        }

        const replacementItem = await this.items.create({
          recommendationId: recommendation.id,
          contentItemId: replacement.id,
          outcomeId: item.outcomeId,
          rank: item.rank,
          score: item.score,
          reasonCode: 'MANAGER_REPLACED',
          reasonEn: 'Replaced by the manager with a different item.',
          reasonAr: 'استبدله المدير بعنصر آخر.',
          signalBreakdown: {},
          status: 'PROPOSED',
        } as never);

        await writeAuditLog({
          organizationId: actor.organizationId,
          actorId: actor.id,
          actorType: 'USER',
          action: 'recommendation.item.replace.created',
          entityType: 'RecommendationItem',
          entityId: replacementItem.id,
          after: { contentItemId: replacementItem.contentItemId, replaces: item.id },
        });

        updated = await this.items.update(item.id, {
          status: 'OVERRIDDEN',
          overriddenWithId: replacementItem.id,
        } as never);
        break;
      }
    }

    // ACCEPT mutates nothing (the recommendation-level `confirm()` is the
    // real commit) — an audit row with identical before/after would be noise.
    if (action.action !== 'ACCEPT') {
      await writeAuditLog({
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorType: 'USER',
        action: `recommendation.item.${action.action.toLowerCase()}`,
        entityType: 'RecommendationItem',
        entityId: item.id,
        before: { status: item.status, rank: item.rank },
        after: { status: updated.status, rank: updated.rank },
      });
    }

    return updated;
  }

  /** `RC-06` — the hard invariant: nothing is applied to a plan until this runs. */
  async confirm(actor: ActingUser, recommendationId: string) {
    const recommendation = await this.loadOwned(recommendationId);
    if (recommendation.status !== 'PROPOSED') {
      throw new ConflictError('Recommendation is no longer PROPOSED');
    }

    const confirmed = await this.recommendations.update(recommendation.id, {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      confirmedById: actor.id,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'recommendation.confirmed',
      entityType: 'Recommendation',
      entityId: confirmed.id,
    });

    eventBus.publish('recommendation.confirmed', {
      recommendationId: confirmed.id,
      organizationId: actor.organizationId,
      learnerId: confirmed.learnerId,
      confirmedById: actor.id,
    });

    const items = await this.items.findByRecommendation(confirmed.id);
    return { recommendation: confirmed, items };
  }
}
