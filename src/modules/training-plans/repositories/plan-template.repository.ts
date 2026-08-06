import type { PlanTemplate } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type PlanTemplateDelegate = typeof prisma.planTemplate;

export class PlanTemplateRepository extends BaseRepository<PlanTemplate, PlanTemplateDelegate> {
  constructor() {
    super(prisma.planTemplate, 'createdAt');
  }

  async findByTrackAndLevel(trackId: string, levelId: string): Promise<PlanTemplate[]> {
    return this.delegate.findMany({ where: { trackId, levelId } });
  }
}
