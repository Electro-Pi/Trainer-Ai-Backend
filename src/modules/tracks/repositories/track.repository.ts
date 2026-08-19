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
      select: { department: { select: { name: true } } },
    });
    return row?.department.name ?? null;
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
   * A track can only be hard-deleted while it's still empty — no `Level` has
   * ever been added, and no `ContentItem`/`PlanTemplate` references it
   * directly. Once any of those exist, deleting the track would either
   * orphan real training data or hit the FK constraint (neither relation
   * cascades — deletion is deliberately not modeled beyond this empty case,
   * per the deactivate/archive-not-delete convention for populated records).
   */
  async hasChildren(id: string): Promise<boolean> {
    const [levelCount, contentCount, templateCount] = await Promise.all([
      prisma.level.count({ where: { trackId: id } }),
      prisma.contentItem.count({ where: { trackId: id } }),
      prisma.planTemplate.count({ where: { trackId: id } }),
    ]);
    return levelCount > 0 || contentCount > 0 || templateCount > 0;
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
        SELECT DISTINCT ON (t."key") t.*, d."name" AS "departmentName"
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
              category: skillDto.category,
              descriptionEn: skillDto.descriptionEn,
              descriptionAr: skillDto.descriptionAr,
              levels: [template.nameEn],
              assessmentEnabled: skillDto.assessmentEnabled ?? true,
            },
          });

          const outcomes: Outcome[] = [];
          for (const [outcomeIndex, outcomeDto] of skillDto.outcomes.entries()) {
            const outcome = await tx.outcome.create({
              data: {
                levelId: level.id,
                skillId: skill.id,
                titleEn: outcomeDto.titleEn,
                titleAr: outcomeDto.titleAr,
                targetSkills: [skillDto.nameEn],
                order: outcomeIndex + 1,
              },
            });
            outcomes.push(outcome);
          }

          const content: FullTrackResponseDto['levels'][number]['skills'][number]['content'] = [];
          for (const contentDto of skillDto.content) {
            const item = await tx.contentItem.create({
              data: {
                organizationId,
                title: contentDto.title,
                trackId: track.id,
                levelId: level.id,
                contentType: contentDto.contentType,
                textBody: contentDto.textBody ?? null,
                sourceUrl: contentDto.sourceUrl ?? null,
                language: contentDto.language,
                skillTags: [skillDto.nameEn],
                createdById: actorId,
                status: 'PUBLISHED',
                publishedAt: new Date(),
              },
            });
            for (const idx of contentDto.outcomeIndexes) {
              await tx.contentOutcome.create({
                data: { contentItemId: item.id, outcomeId: outcomes[idx]!.id },
              });
            }
            content.push({ id: item.id, title: item.title, status: item.status });
          }

          skills.push({
            id: skill.id,
            nameEn: skill.nameEn,
            nameAr: skill.nameAr,
            category: skill.category,
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
        select: { name: true },
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
          departmentName: departmentRow?.name ?? '',
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
