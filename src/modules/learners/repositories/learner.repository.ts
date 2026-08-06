import type { Learner } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type LearnerDelegate = typeof prisma.learner;

export class LearnerRepository extends BaseRepository<Learner, LearnerDelegate> {
  constructor() {
    super(prisma.learner, 'createdAt');
  }

  async findByTeam(teamId: string): Promise<Learner[]> {
    return this.delegate.findMany({ where: { teamId } });
  }

  async findByEntraObjectId(entraObjectId: string): Promise<Learner | null> {
    return this.delegate.findFirst({ where: { entraObjectId } });
  }
}
