import type { Level, Outcome, Prisma, Track } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { getCurrentOrganizationId } from '@/database/tenant-context.js';

export type { Track };

type TrackDelegate = typeof prisma.track;

export class TrackRepository extends BaseRepository<Track, TrackDelegate> {
  constructor() {
    super(prisma.track, 'sortOrder');
  }

  async findByKey(key: string): Promise<Track | null> {
    return this.delegate.findFirst({ where: { key } });
  }

  async findManyByTrack(where: Prisma.TrackWhereInput): Promise<Track[]> {
    return this.delegate.findMany({ where, orderBy: { sortOrder: 'asc' } });
  }

  /**
   * `P4-6` — transactional reorder. `order` is the full ordered list of ids
   * belonging to this org's tracks; every id must already exist and belong
   * to the caller's org, verified by the caller before this runs.
   */
  async reorder(order: string[]): Promise<void> {
    await prisma.$transaction(
      order.map((id, index) =>
        this.delegate.update({ where: { id } as never, data: { sortOrder: index } as never }),
      ),
    );
  }

  /**
   * `TC-07` — deep copy: the track itself, every level, and every outcome
   * per level, all in one org. Runs inside `prisma.$transaction` so a
   * partial copy can never land. `Level`/`Outcome` have no repository access
   * to the raw tx client, so this reaches Prisma directly — the same
   * exception `LearnerAssignmentRepository.assignWithOutcomes` takes for a
   * multi-model atomic write (D-12b keeps it on the repository, not the
   * service).
   */
  async duplicate(sourceId: string, newKey: string): Promise<Track> {
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('duplicate() called outside runWithTenant()');
    }

    return prisma.$transaction(async (tx) => {
      const source = await tx.track.findFirst({ where: { id: sourceId, organizationId } });
      if (!source) {
        throw new Error(`Track ${sourceId} not found in organization ${organizationId}`);
      }

      const sourceLevels: Level[] = await tx.level.findMany({
        where: { trackId: sourceId },
        orderBy: { order: 'asc' },
      });

      const copy = await tx.track.create({
        data: {
          organizationId,
          key: newKey,
          nameEn: source.nameEn,
          nameAr: source.nameAr,
          descriptionEn: source.descriptionEn,
          descriptionAr: source.descriptionAr,
          department: source.department,
          targetSkills: source.targetSkills,
          trainingForm: source.trainingForm,
          impactIndicators: source.impactIndicators,
          isEnabled: false,
          sortOrder: source.sortOrder,
        },
      });

      for (const level of sourceLevels) {
        const sourceOutcomes: Outcome[] = await tx.outcome.findMany({
          where: { levelId: level.id },
          orderBy: { order: 'asc' },
        });

        const levelCopy = await tx.level.create({
          data: {
            trackId: copy.id,
            key: level.key,
            nameEn: level.nameEn,
            nameAr: level.nameAr,
            descriptionEn: level.descriptionEn,
            descriptionAr: level.descriptionAr,
            order: level.order,
            isEnabled: level.isEnabled,
          },
        });

        for (const outcome of sourceOutcomes) {
          await tx.outcome.create({
            data: {
              levelId: levelCopy.id,
              titleEn: outcome.titleEn,
              titleAr: outcome.titleAr,
              descriptionEn: outcome.descriptionEn,
              descriptionAr: outcome.descriptionAr,
              targetSkills: outcome.targetSkills,
              trainingForm: outcome.trainingForm,
              order: outcome.order,
              isEnabled: outcome.isEnabled,
            },
          });
        }
      }

      return copy;
    });
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * cannot scope (it can't merge `organizationId` into a unique `where` —
   * see the extension's own doc comment). `findFirst` IS scoped, so this is
   * the safe way to resolve a `Track` by id when the caller only trusts a
   * request-supplied id (e.g. a level assignment's `trackId`).
   */
  async findByIdScoped(id: string): Promise<Track | null> {
    return this.delegate.findFirst({ where: { id } });
  }
}
