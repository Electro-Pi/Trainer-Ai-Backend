import type { RubricCriterion } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { RubricCriterion };

type RubricCriterionDelegate = typeof prisma.rubricCriterion;

/** Weights must total 100 — validated in the assessments service, not here. */
export class RubricCriterionRepository extends BaseRepository<
  RubricCriterion,
  RubricCriterionDelegate
> {
  constructor() {
    super(prisma.rubricCriterion, 'order');
  }

  async findByRubric(rubricId: string): Promise<RubricCriterion[]> {
    return this.delegate.findMany({ where: { rubricId }, orderBy: { order: 'asc' } });
  }

  async deleteByRubric(rubricId: string): Promise<void> {
    await prisma.rubricCriterion.deleteMany({ where: { rubricId } });
  }

  /** `createMany` doesn't return rows in Postgres — caller re-reads via `findByRubric` after this. */
  async createManyForRubric(
    rubricId: string,
    criteria: { label: string; description: string; weight: number; order: number }[],
  ): Promise<void> {
    await prisma.rubricCriterion.createMany({
      data: criteria.map((c) => ({ ...c, rubricId })),
    });
  }
}
