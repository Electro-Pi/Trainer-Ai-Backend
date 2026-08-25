import type { Level, Outcome, Prisma, Track } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { getCurrentOrganizationId } from '@/database/tenant-context.js';

import type { CreateFullTrackDto, FullTrackResponseDto } from '../dto/track.dto.js';

export type { Track };

type TrackDelegate = typeof prisma.track;

/**
 * Mirrors `prisma/seed/tracks.seed.ts`'s `LEVEL_TEMPLATE` — deliberately
 * duplicated rather than imported (that file lives outside `src/`'s build
 * graph). Keep both in sync if the 4 canonical levels ever change.
 */
const LEVEL_TEMPLATE: {
  key: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  nameEn: string;
  nameAr: string;
}[] = [
  { key: 'beginner', nameEn: 'Beginner', nameAr: 'مبتدئ' },
  { key: 'intermediate', nameEn: 'Intermediate', nameAr: 'متوسط' },
  { key: 'advanced', nameEn: 'Advanced', nameAr: 'متقدم' },
  { key: 'expert', nameEn: 'Expert', nameAr: 'خبير' },
];

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export class TrackRepository extends BaseRepository<Track, TrackDelegate> {
  constructor() {
    super(prisma.track, 'sortOrder');
  }

  async findByKey(key: string): Promise<Track | null> {
    return this.delegate.findFirst({ where: { key } });
  }

  /**
   * `Track.departmentId` read-through for `TrackResponseDto.departmentName`.
   * `Department` isn't a tenant-scoped model on the Prisma extension (it
   * carries no direct `organizationId`-filtered query need elsewhere yet),
   * so this reads it via the already-org-scoped `Track` row rather than
   * querying `Department` directly.
   */
  async findDepartmentName(trackId: string): Promise<string | null> {
    const row = await prisma.track.findFirst({
      where: { id: trackId },
      select: { department: { select: { nameEn: true } } },
    });
    return row?.department.nameEn ?? null;
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
   * service). Levels' `Skill`s are NOT copied — a level-scoped skill is part
   * of the master catalogue, not a per-track-duplicate concern (mirrors how
   * `Outcome`'s `skillId` FK is also left unset on the copy, below).
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
          departmentId: source.departmentId,
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
              targetSkills: outcome.targetSkills,
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

  /** Batched form of `findByIdScoped` — `Track` is directly tenant-scoped, so `findMany` is safe. */
  async findManyByIds(ids: string[]): Promise<Track[]> {
    if (ids.length === 0) return [];
    return this.delegate.findMany({ where: { id: { in: ids } } });
  }

  /**
   * The one hard, un-cascadable block on deleting a track: a real learner
   * plan (`LearnerAssignment`) or a saved-as-template plan structure
   * (`PlanTemplate`) referencing it. Both are deliberate artifacts (a real
   * learner's training history, or a manager's explicit "save as template"
   * action) — never silently destroyed, archive instead. Levels/skills/
   * outcomes/content on the track are NOT checked here — see `deleteDeep`,
   * which cascades those away as long as this check passes, since none of
   * them can have real learner data attached without a `LearnerAssignment`
   * existing first (every session/assessment/recommendation chain requires
   * one).
   */
  async hasLearnerPlan(id: string): Promise<boolean> {
    const [assignmentCount, templateCount] = await Promise.all([
      prisma.learnerAssignment.count({ where: { trackId: id } }),
      prisma.planTemplate.count({ where: { trackId: id } }),
    ]);
    return assignmentCount > 0 || templateCount > 0;
  }

  /**
   * Cascade-deletes a track that has no learner plan attached
   * (`hasLearnerPlan` already checked by the caller) — every level, skill,
   * outcome, and content item it owns, plus everything hanging directly off
   * those (rubrics/question banks, slide decks, content chunks/media,
   * prerequisites, effectiveness rows), then the track itself. Safe to wipe
   * because `hasLearnerPlan` returning false guarantees no `Session`/
   * `Assessment`/`LearnerOutcome`/`Recommendation` can reference any of this
   * — every one of those requires a `LearnerAssignment` (directly or via
   * `TrainingPlan.assignmentId`) to exist first.
   *
   * One `prisma.$transaction` so a failure partway never leaves the track
   * half-deleted. Deletes children before parents throughout (FK order).
   */
  async deleteDeep(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const levels = await tx.level.findMany({ where: { trackId: id }, select: { id: true } });
      const levelIds = levels.map((l) => l.id);

      const skills = await tx.skill.findMany({
        where: { levelId: { in: levelIds } },
        select: { id: true },
      });
      const skillIds = skills.map((s) => s.id);

      const outcomes = await tx.outcome.findMany({
        where: { levelId: { in: levelIds } },
        select: { id: true },
      });
      const outcomeIds = outcomes.map((o) => o.id);

      const contentItems = await tx.contentItem.findMany({
        where: { skillId: { in: skillIds } },
        select: { id: true },
      });
      const contentItemIds = contentItems.map((c) => c.id);

      const mediaAssets = await tx.mediaAsset.findMany({
        where: { contentItemId: { in: contentItemIds } },
        select: { id: true },
      });
      const mediaAssetIds = mediaAssets.map((m) => m.id);

      const rubrics = await tx.rubric.findMany({
        where: { outcomeId: { in: outcomeIds } },
        select: { id: true },
      });
      const rubricIds = rubrics.map((r) => r.id);

      const questionBanks = await tx.questionBank.findMany({
        where: { outcomeId: { in: outcomeIds } },
        select: { id: true },
      });
      const questionBankIds = questionBanks.map((q) => q.id);

      // Content-side leaves first.
      await tx.contentChunk.deleteMany({ where: { contentItemId: { in: contentItemIds } } });
      await tx.mediaAsset.deleteMany({ where: { id: { in: mediaAssetIds } } });
      await tx.contentEffectiveness.deleteMany({
        where: { contentItemId: { in: contentItemIds } },
      });
      await tx.contentPrerequisite.deleteMany({
        where: {
          OR: [
            { contentItemId: { in: contentItemIds } },
            { prerequisiteContentId: { in: contentItemIds } },
            { prerequisiteOutcomeId: { in: outcomeIds } },
          ],
        },
      });
      await tx.contentItem.deleteMany({ where: { id: { in: contentItemIds } } });

      // Outcome-side leaves.
      await tx.question.deleteMany({ where: { questionBankId: { in: questionBankIds } } });
      await tx.questionBank.deleteMany({ where: { id: { in: questionBankIds } } });
      await tx.rubricCriterion.deleteMany({ where: { rubricId: { in: rubricIds } } });
      await tx.rubric.deleteMany({ where: { id: { in: rubricIds } } });

      // Skill-side leaves.
      await tx.slideDeck.deleteMany({ where: { skillId: { in: skillIds } } });

      await tx.outcome.deleteMany({ where: { id: { in: outcomeIds } } });
      await tx.skill.deleteMany({ where: { id: { in: skillIds } } });
      await tx.level.deleteMany({ where: { id: { in: levelIds } } });
      await tx.track.delete({ where: { id } });
    });
  }

  /**
   * `WS-02` — the public marketing site has no tenant/auth context, but
   * `Track` is tenant-scoped (the extension refuses any query outside
   * `runWithTenant()`, by design — see `tenant.extension.ts`'s doc comment).
   * Every org gets its own copy of the same 8 BRD tracks at seed time
   * (P1-6), so this deliberately bypasses the extension via raw SQL — the
   * same escape hatch `SessionRepository.findByJoinToken` uses — reading
   * across every org's enabled tracks and keeping one row per `key` (the
   * shared BRD content, not any one tenant's customized copy). Narrow on
   * purpose (`isEnabled` only, `SELECT *` on one row per key), never exposed
   * as a general cross-tenant finder.
   *
   * Joins `departments` for a readable `departmentName` — `Track.departmentId`
   * alone is an opaque id the public marketing site has no other way to
   * resolve (no tenant/auth context to call an authenticated department
   * lookup with).
   */
  async findPublicByKey(): Promise<(Track & { departmentName: string })[]> {
    return prisma.$queryRaw<(Track & { departmentName: string })[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (t."key") t.*, d."nameEn" AS "departmentName"
        FROM "tracks" t
        JOIN "departments" d ON d."id" = t."departmentId"
        WHERE t."isEnabled" = true
        ORDER BY t."key", t."sortOrder" ASC
      ) AS deduped
      ORDER BY "sortOrder" ASC
    `;
  }

  /**
   * Track-creation wizard's single Save action — creates Track, its selected
   * Levels, and every nested Skill/Outcome/ContentItem (+ ContentOutcome
   * joins) inside one `prisma.$transaction`, so a failure partway leaves
   * nothing orphaned. Same raw-`tx` escape hatch `duplicate()` above uses:
   * child models have no repository access to the ambient transaction
   * client, so this reaches Prisma directly rather than composing
   * `SkillRepository`/`OutcomeRepository`/`ContentRepository` (none of which
   * accept an external `tx`).
   *
   * `trainingForm`/`targetSkills`/`impactIndicators` aren't collected by the
   * wizard UI — derived here from the submitted skills/outcomes instead of
   * asking the manager to fill in fields the flow has no natural home for
   * (product decision, not a technical constraint).
   */
  async createFull(dto: CreateFullTrackDto, actorId: string): Promise<FullTrackResponseDto> {
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('createFull() called outside runWithTenant()');
    }

    const key = await this.generateUniqueTrackKey(organizationId, dto.nameEn);

    const allSkillNames = [...new Set(dto.levels.flatMap((l) => l.skills.map((s) => s.nameEn)))];
    // Outcome.trainingForm was removed from the DB and DTO (Track.icon/
    // ContentItem removal pass). Track.trainingForm still exists, but the
    // wizard no longer collects any per-outcome data to derive it from, so
    // it's hardcoded to the neutral default instead of aggregated.
    const derivedTrainingForm = 'CONVERSATION';

    return prisma.$transaction(async (tx) => {
      const track = await tx.track.create({
        data: {
          organizationId,
          key,
          nameEn: dto.nameEn,
          nameAr: dto.nameAr,
          descriptionEn: dto.descriptionEn,
          descriptionAr: dto.descriptionAr,
          departmentId: dto.departmentId,
          targetSkills: allSkillNames,
          trainingForm: derivedTrainingForm,
          impactIndicators: allSkillNames,
        },
      });

      const levels: FullTrackResponseDto['levels'] = [];

      for (const [levelIndex, levelDto] of dto.levels.entries()) {
        const template = LEVEL_TEMPLATE.find((l) => l.key === levelDto.key);
        if (!template) {
          throw new Error(`Unknown level key: ${levelDto.key}`);
        }

        const level = await tx.level.create({
          data: {
            trackId: track.id,
            key: template.key,
            nameEn: template.nameEn,
            nameAr: template.nameAr,
            descriptionEn: `${template.nameEn} level of ${dto.nameEn}.`,
            descriptionAr: `مستوى ${template.nameAr} في ${dto.nameAr}.`,
            order: levelIndex + 1,
          },
        });

        const skills: FullTrackResponseDto['levels'][number]['skills'] = [];
        // `Outcome.order` is unique per (levelId, order), not per skill — a
        // counter reset to 1 for every skill collided as soon as a level had
        // more than one skill (both skills' first outcome fought over
        // order:1 for the same levelId, P2002). Running across the whole
        // level keeps every outcome's order unique within it.
        let outcomeOrder = 0;

        for (const skillDto of levelDto.skills) {
          // Inlined (not extracted to a helper) so `tx`'s tenant-extended
          // Prisma type stays inferred from this closure — naming it as a
          // parameter type elsewhere doesn't structurally match.
          const skillKeyBase = slugify(skillDto.nameEn) || 'skill';
          let skillKey = skillKeyBase;
          let skillKeySuffix = 2;
          while (await tx.skill.findFirst({ where: { organizationId, key: skillKey } })) {
            skillKey = `${skillKeyBase}-${skillKeySuffix}`;
            skillKeySuffix += 1;
          }
          const skill = await tx.skill.create({
            data: {
              organizationId,
              levelId: level.id,
              key: skillKey,
              nameEn: skillDto.nameEn,
              nameAr: skillDto.nameAr,
              descriptionEn: skillDto.descriptionEn,
              descriptionAr: skillDto.descriptionAr,
              levels: [template.nameEn],
              assessmentEnabled: skillDto.assessmentEnabled ?? true,
            },
          });

          const outcomes: Outcome[] = [];
          for (const outcomeDto of skillDto.outcomes) {
            outcomeOrder += 1;
            const outcome = await tx.outcome.create({
              data: {
                levelId: level.id,
                skillId: skill.id,
                titleEn: outcomeDto.titleEn,
                titleAr: outcomeDto.titleAr,
                targetSkills: [skillDto.nameEn],
                order: outcomeOrder,
              },
            });
            outcomes.push(outcome);
          }

          const content: FullTrackResponseDto['levels'][number]['skills'][number]['content'] = [];
          for (const contentDto of skillDto.content) {
            const item = await tx.contentItem.create({
              data: {
                organizationId,
                skillId: skill.id,
                name: contentDto.name,
                createdById: actorId,
              },
            });
            content.push({ id: item.id, name: item.name });
          }

          skills.push({
            id: skill.id,
            nameEn: skill.nameEn,
            nameAr: skill.nameAr,
            outcomes: outcomes.map((o) => ({ id: o.id, titleEn: o.titleEn, titleAr: o.titleAr })),
            content,
          });
        }

        levels.push({
          id: level.id,
          key: level.key as CreateFullTrackDto['levels'][number]['key'],
          nameEn: level.nameEn,
          nameAr: level.nameAr,
          order: level.order,
          skills,
        });
      }

      const departmentRow = await tx.department.findFirst({
        where: { id: track.departmentId },
        select: { nameEn: true },
      });

      return {
        track: {
          id: track.id,
          organizationId: track.organizationId,
          key: track.key,
          nameEn: track.nameEn,
          nameAr: track.nameAr,
          descriptionEn: track.descriptionEn,
          descriptionAr: track.descriptionAr,
          departmentId: track.departmentId,
          departmentName: departmentRow?.nameEn ?? '',
          targetSkills: track.targetSkills,
          trainingForm: track.trainingForm,
          impactIndicators: track.impactIndicators,
          isEnabled: track.isEnabled,
          sortOrder: track.sortOrder,
          createdAt: track.createdAt.toISOString(),
          updatedAt: track.updatedAt.toISOString(),
        },
        levels,
      };
    });
  }

  /** Probe-loop key generation, scoped to the ambient transaction so concurrent creates in the same tx never collide. */
  private async generateUniqueTrackKey(organizationId: string, nameEn: string): Promise<string> {
    const base = slugify(nameEn) || 'track';
    let candidate = base;
    let suffix = 2;
    while (await prisma.track.findFirst({ where: { organizationId, key: candidate } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}
