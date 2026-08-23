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

  /** Batched form of `findByIdScoped` — `Skill` is directly tenant-scoped, so `findMany` is safe. */
  async findManyByIds(ids: string[]): Promise<Skill[]> {
    if (ids.length === 0) return [];
    return this.delegate.findMany({ where: { id: { in: ids } } });
  }

  /** A level's skills, ordered by name — the level-scoped skill catalogue (`Skill.levelId`). */
  async findByLevel(levelId: string): Promise<Skill[]> {
    return this.delegate.findMany({ where: { levelId }, orderBy: { nameEn: 'asc' } });
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
        descriptionEn: source.descriptionEn,
        descriptionAr: source.descriptionAr,
        levelId: source.levelId,
        levels: source.levels,
        assessmentEnabled: source.assessmentEnabled,
        isEnabled: false,
      },
    });
  }
}
