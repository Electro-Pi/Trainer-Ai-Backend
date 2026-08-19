import type { SlideDeck } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { SlideDeck };

type SlideDeckDelegate = typeof prisma.slideDeck;

export class SlideDeckRepository extends BaseRepository<SlideDeck, SlideDeckDelegate> {
  constructor() {
    super(prisma.slideDeck, 'createdAt');
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * cannot scope — same reasoning as every other module's `findByIdScoped`
   * (see `SkillRepository.findByIdScoped`). A request-supplied `SlideDeck.id`
   * must resolve through this `findFirst` instead.
   */
  async findByIdScoped(id: string): Promise<SlideDeck | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  async findBySkillId(skillId: string): Promise<SlideDeck | null> {
    return this.delegate.findFirst({ where: { skillId } });
  }

  /** `POST /tracks/:trackId/slides` upserts one deck per skill — create on first generation, update in place on regeneration. */
  async upsertForSkill(input: {
    organizationId: string;
    skillId: string;
    aiDeckId: string;
    status: string;
    slideCount: number | null;
    generationError: string | null;
    downloadUrl: string | null;
  }): Promise<SlideDeck> {
    const existing = await this.findBySkillId(input.skillId);

    if (existing) {
      return this.delegate.update({
        where: { id: existing.id } as never,
        data: {
          aiDeckId: input.aiDeckId,
          status: input.status,
          slideCount: input.slideCount,
          generationError: input.generationError,
          downloadUrl: input.downloadUrl,
        } as never,
      });
    }

    return this.delegate.create({
      data: {
        organizationId: input.organizationId,
        skillId: input.skillId,
        aiDeckId: input.aiDeckId,
        status: input.status,
        slideCount: input.slideCount,
        generationError: input.generationError,
        downloadUrl: input.downloadUrl,
      } as never,
    });
  }
}
