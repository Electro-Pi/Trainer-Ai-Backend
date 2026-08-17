import type { Outcome } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { getCurrentOrganizationId } from '@/database/tenant-context.js';

export type { Outcome };

type OutcomeDelegate = typeof prisma.outcome;

/** Not directly tenant-scoped — reached via `levelId` → `trackId` → `Track.organizationId`. */
export class OutcomeRepository extends BaseRepository<Outcome, OutcomeDelegate> {
  constructor() {
    super(prisma.outcome, 'order');
  }

  async findByLevel(levelId: string): Promise<Outcome[]> {
    return this.delegate.findMany({ where: { levelId }, orderBy: { order: 'asc' } });
  }

  /** Every enabled outcome carrying one of these skills, across levels — the plan-snapshot deep-copy's per-skill outcome lookup. */
  async findBySkillIds(skillIds: string[]): Promise<Outcome[]> {
    if (skillIds.length === 0) return [];
    return this.delegate.findMany({
      where: { skillId: { in: skillIds }, isEnabled: true },
      orderBy: { order: 'asc' },
    });
  }

  /** Same tenant-verification need as `LevelRepository.findByIdScoped` — see its doc comment. */
  async findByIdScoped(id: string): Promise<Outcome | null> {
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('findByIdScoped() called outside runWithTenant()');
    }
    return this.delegate.findFirst({ where: { id, level: { track: { organizationId } } } });
  }

  /**
   * `P4-6` — transactional reorder within one level. Two-phase for the same
   * reason as `LevelRepository.reorder`: `(levelId, order)` is a
   * non-deferred unique constraint, so intermediate collisions are possible
   * writing final positions directly.
   */
  async reorder(order: string[]): Promise<void> {
    const offset = order.length + 1000;
    await prisma.$transaction([
      ...order.map((id, index) =>
        this.delegate.update({ where: { id } as never, data: { order: offset + index } as never }),
      ),
      ...order.map((id, index) =>
        this.delegate.update({ where: { id } as never, data: { order: index } as never }),
      ),
    ]);
  }

  /**
   * `TC-07`-equivalent for a single outcome — copies title/description/
   * skills/training-form into a new row on the same level, appended after
   * the current last outcome (`order`), disabled by default so it can be
   * reviewed/edited before going live (mirrors `TrackRepository.duplicate`'s
   * `isEnabled: false` convention).
   */
  async duplicate(sourceId: string): Promise<Outcome> {
    const source = await this.findByIdScoped(sourceId);
    if (!source) {
      throw new Error(`Outcome ${sourceId} not found`);
    }
    const siblings = await this.findByLevel(source.levelId);

    return this.delegate.create({
      data: {
        levelId: source.levelId,
        skillId: source.skillId,
        titleEn: `${source.titleEn} (copy)`,
        titleAr: `${source.titleAr} (نسخة)`,
        descriptionEn: source.descriptionEn,
        descriptionAr: source.descriptionAr,
        targetSkills: source.targetSkills,
        trainingForm: source.trainingForm,
        order: siblings.length,
        isEnabled: false,
      },
    });
  }

  /**
   * An outcome can only be hard-deleted while nothing real has attached to
   * it yet — no content link, no learner assignment/progress, no session,
   * no recommendation, no rubric/question bank, and it isn't another
   * content item's prerequisite. Once any of those exist, deleting would
   * either orphan real training/assessment history or hit the FK
   * constraint (none of these relations cascade) — archive
   * (`setEnabled(false)`) instead, per the deactivate/archive-not-delete
   * convention.
   */
  async hasChildren(id: string): Promise<boolean> {
    const counts = await Promise.all([
      prisma.contentOutcome.count({ where: { outcomeId: id } }),
      prisma.contentPrerequisite.count({ where: { prerequisiteOutcomeId: id } }),
      prisma.learnerOutcome.count({ where: { outcomeId: id } }),
      prisma.questionBank.count({ where: { outcomeId: id } }),
      prisma.rubric.count({ where: { outcomeId: id } }),
      prisma.recommendationItem.count({ where: { outcomeId: id } }),
      prisma.sessionOutcome.count({ where: { outcomeId: id } }),
      prisma.contentEffectiveness.count({ where: { outcomeId: id } }),
      prisma.session.count({ where: { primaryOutcomeId: id } }),
    ]);
    return counts.some((count) => count > 0);
  }
}
