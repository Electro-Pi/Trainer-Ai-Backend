import type { RubricCriterion } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

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
}
