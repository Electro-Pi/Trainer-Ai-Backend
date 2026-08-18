import type {
  PlanContentMedia,
  PlanContentSnapshot,
  PlanLearnerOutcomeSnapshot,
  PlanOutcomeSnapshot,
  PlanSkillSnapshot,
  PlanTrackSnapshot,
} from '@prisma/client';

import { prisma } from '@/database/prisma.service.js';

export type {
  PlanContentMedia,
  PlanContentSnapshot,
  PlanLearnerOutcomeSnapshot,
  PlanOutcomeSnapshot,
  PlanSkillSnapshot,
  PlanTrackSnapshot,
};

export interface PlanTrackSnapshotTree extends PlanTrackSnapshot {
  skills: (PlanSkillSnapshot & {
    outcomes: (PlanOutcomeSnapshot & { progress: PlanLearnerOutcomeSnapshot | null })[];
    content: (PlanContentSnapshot & { media: PlanContentMedia[] })[];
  })[];
  /** Content with no `skillSnapshotId` (manager-added at the track level, or a pre-migration row). */
  content: (PlanContentSnapshot & { media: PlanContentMedia[] })[];
}

/**
 * Not a `BaseRepository` subclass — `PlanTrackSnapshot` is reached only
 * through `trainingPlanId` (one snapshot per plan, `@unique`), and every
 * write here is either the one atomic deep-copy transaction or a scoped
 * mutation keyed by a child snapshot id, not generic CRUD by its own `id`.
 * Same D-12b reasoning `TrackRepository.duplicate()` documents for a
 * multi-model atomic write living on the repository, not the service.
 */
export class PlanTrackSnapshotRepository {
  async findByTrainingPlanId(trainingPlanId: string): Promise<PlanTrackSnapshotTree | null> {
    return prisma.planTrackSnapshot.findUnique({
      where: { trainingPlanId },
      include: {
        content: { where: { skillSnapshotId: null }, include: { media: true } },
        skills: {
          include: {
            outcomes: { include: { progress: true } },
            content: { include: { media: true } },
          },
        },
      },
    });
  }

  async findByIdWithTree(id: string): Promise<PlanTrackSnapshotTree | null> {
    return prisma.planTrackSnapshot.findUnique({
      where: { id },
      include: {
        content: { where: { skillSnapshotId: null }, include: { media: true } },
        skills: {
          include: {
            outcomes: { include: { progress: true } },
            content: { include: { media: true } },
          },
        },
      },
    });
  }

  /**
   * `PlanSnapshotService.createFromMasterTrack`'s deep-copy, one
   * transaction: Track → its level's `Skill`s (via `Skill.levelId`) → each
   * Skill's `Outcome`s (via the `Outcome.skillId` FK) → each Outcome's linked
   * `ContentItem`s (via `ContentOutcome`), plus one `PlanLearnerOutcomeSnapshot`
   * per copied outcome. A partial copy can never land.
   */
  async createFromMasterTrack(params: {
    trainingPlanId: string;
    track: {
      id: string;
      nameEn: string;
      nameAr: string;
      descriptionEn: string;
      descriptionAr: string;
    };
    trackSkills: {
      skillId: string;
      nameEn: string;
      nameAr: string;
      descriptionEn: string;
      descriptionAr: string;
      category: string;
      levels: string[];
    }[];
    outcomesBySkillId: Map<
      string,
      {
        id: string;
        titleEn: string;
        titleAr: string;
        descriptionEn: string;
        descriptionAr: string;
        order: number;
      }[]
    >;
    contentByOutcomeId: Map<
      string,
      {
        id: string;
        title: string;
        contentType: string;
        sourceUrl: string | null;
        textBody: string | null;
      }[]
    >;
  }): Promise<PlanTrackSnapshotTree> {
    const snapshotId = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.planTrackSnapshot.create({
        data: {
          trainingPlanId: params.trainingPlanId,
          sourceTrackId: params.track.id,
          nameEn: params.track.nameEn,
          nameAr: params.track.nameAr,
          descriptionEn: params.track.descriptionEn,
          descriptionAr: params.track.descriptionAr,
        },
      });

      // De-duplicated across skills — the same ContentItem can be linked to
      // outcomes under more than one skill; it should only be copied once.
      const contentSnapshotIdBySourceId = new Map<string, string>();

      for (const trackSkill of params.trackSkills) {
        const skillSnapshot = await tx.planSkillSnapshot.create({
          data: {
            snapshotId: snapshot.id,
            sourceSkillId: trackSkill.skillId,
            nameEn: trackSkill.nameEn,
            nameAr: trackSkill.nameAr,
            descriptionEn: trackSkill.descriptionEn,
            descriptionAr: trackSkill.descriptionAr,
            category: trackSkill.category,
            levels: trackSkill.levels,
          },
        });

        const outcomes = params.outcomesBySkillId.get(trackSkill.skillId) ?? [];
        for (const outcome of outcomes) {
          const outcomeSnapshot = await tx.planOutcomeSnapshot.create({
            data: {
              snapshotId: snapshot.id,
              skillSnapshotId: skillSnapshot.id,
              sourceOutcomeId: outcome.id,
              titleEn: outcome.titleEn,
              titleAr: outcome.titleAr,
              descriptionEn: outcome.descriptionEn,
              descriptionAr: outcome.descriptionAr,
              order: outcome.order,
            },
          });

          await tx.planLearnerOutcomeSnapshot.create({
            data: { outcomeSnapshotId: outcomeSnapshot.id },
          });

          const contentItems = params.contentByOutcomeId.get(outcome.id) ?? [];
          for (const content of contentItems) {
            if (contentSnapshotIdBySourceId.has(content.id)) continue;

            const contentSnapshot = await tx.planContentSnapshot.create({
              data: {
                snapshotId: snapshot.id,
                skillSnapshotId: skillSnapshot.id,
                sourceContentId: content.id,
                title: content.title,
                contentType: content.contentType as never,
                sourceUrl: content.sourceUrl,
                textBody: content.textBody,
              },
            });
            contentSnapshotIdBySourceId.set(content.id, contentSnapshot.id);
          }
        }
      }

      return snapshot.id;
    });

    const tree = await this.findByIdWithTree(snapshotId);
    if (!tree) {
      throw new Error(`PlanTrackSnapshot ${snapshotId} not found immediately after creation`);
    }
    return tree;
  }

  async addSkill(
    snapshotId: string,
    data: {
      sourceSkillId: string | null;
      nameEn: string;
      nameAr: string;
      descriptionEn: string;
      descriptionAr: string;
      category: string;
      levels: string[];
    },
  ): Promise<PlanSkillSnapshot> {
    return prisma.planSkillSnapshot.create({ data: { snapshotId, ...data } });
  }

  async updateSkill(
    skillSnapshotId: string,
    data: Partial<{
      nameEn: string;
      nameAr: string;
      descriptionEn: string;
      descriptionAr: string;
      category: string;
      levels: string[];
      isRemoved: boolean;
    }>,
  ): Promise<PlanSkillSnapshot> {
    return prisma.planSkillSnapshot.update({ where: { id: skillSnapshotId }, data });
  }

  async findSkillById(skillSnapshotId: string): Promise<PlanSkillSnapshot | null> {
    return prisma.planSkillSnapshot.findUnique({ where: { id: skillSnapshotId } });
  }

  async addOutcome(
    snapshotId: string,
    skillSnapshotId: string,
    data: {
      sourceOutcomeId: string | null;
      titleEn: string;
      titleAr: string;
      descriptionEn: string;
      descriptionAr: string;
      order: number;
    },
  ): Promise<PlanOutcomeSnapshot> {
    return prisma.$transaction(async (tx) => {
      const outcome = await tx.planOutcomeSnapshot.create({
        data: { snapshotId, skillSnapshotId, ...data },
      });
      await tx.planLearnerOutcomeSnapshot.create({ data: { outcomeSnapshotId: outcome.id } });
      return outcome;
    });
  }

  async updateOutcome(
    outcomeSnapshotId: string,
    data: Partial<{
      titleEn: string;
      titleAr: string;
      descriptionEn: string;
      descriptionAr: string;
      order: number;
      isRemoved: boolean;
    }>,
  ): Promise<PlanOutcomeSnapshot> {
    return prisma.planOutcomeSnapshot.update({ where: { id: outcomeSnapshotId }, data });
  }

  async findOutcomeById(outcomeSnapshotId: string): Promise<PlanOutcomeSnapshot | null> {
    return prisma.planOutcomeSnapshot.findUnique({ where: { id: outcomeSnapshotId } });
  }

  async addContent(
    snapshotId: string,
    data: {
      skillSnapshotId: string | null;
      sourceContentId: string | null;
      title: string;
      contentType: string;
      sourceUrl: string | null;
      textBody: string | null;
    },
  ): Promise<PlanContentSnapshot> {
    return prisma.planContentSnapshot.create({
      data: { snapshotId, ...data, contentType: data.contentType as never },
    });
  }

  async updateContent(
    contentSnapshotId: string,
    data: Partial<{
      title: string;
      sourceUrl: string | null;
      textBody: string | null;
      isRemoved: boolean;
    }>,
  ): Promise<PlanContentSnapshot> {
    return prisma.planContentSnapshot.update({ where: { id: contentSnapshotId }, data });
  }

  async findContentById(contentSnapshotId: string): Promise<PlanContentSnapshot | null> {
    return prisma.planContentSnapshot.findUnique({ where: { id: contentSnapshotId } });
  }
}
