import type { Skill } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Skill };

type SkillDelegate = typeof prisma.skill;

export class SkillRepository extends BaseRepository<Skill, SkillDelegate> {
  constructor() {
    super(prisma.skill, 'createdAt');
  }

  async findByKey(key: string): Promise<Skill | null> {
    return this.delegate.findFirst({ where: { key } });
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * cannot scope — see `TrackRepository.findByIdScoped`'s doc comment for
   * the same reasoning. `findFirst` is scoped and is the safe way to resolve
   * a `Skill` by a request-supplied id.
   */
  async findByIdScoped(id: string): Promise<Skill | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  async duplicate(sourceId: string, newKey: string): Promise<Skill> {
    const source = await this.findByIdScoped(sourceId);
    if (!source) {
      throw new Error(`Skill ${sourceId} not found`);
    }

    return this.delegate.create({
      data: {
        organizationId: source.organizationId,
        key: newKey,
        nameEn: `${source.nameEn} (copy)`,
        nameAr: `${source.nameAr} (نسخة)`,
        category: source.category,
        descriptionEn: source.descriptionEn,
        descriptionAr: source.descriptionAr,
        targetTracks: source.targetTracks,
        levels: source.levels,
        assessmentEnabled: source.assessmentEnabled,
        isEnabled: false,
      },
    });
  }
}
