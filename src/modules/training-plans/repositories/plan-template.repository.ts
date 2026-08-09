import type { PlanTemplate } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { PlanTemplate };

type PlanTemplateDelegate = typeof prisma.planTemplate;

export class PlanTemplateRepository extends BaseRepository<PlanTemplate, PlanTemplateDelegate> {
  constructor() {
    super(prisma.planTemplate, 'createdAt');
  }

  async findByTrackAndLevel(trackId: string, levelId: string): Promise<PlanTemplate[]> {
    return this.delegate.findMany({ where: { trackId, levelId } });
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request-supplied id. */
  async findByIdScoped(id: string): Promise<PlanTemplate | null> {
    return this.delegate.findFirst({ where: { id } });
  }
}
