import { randomUUID } from 'node:crypto';

import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { contentItemRepository } from '@/modules/content/content.module.js';
import { learnerAssignmentRepository } from '@/modules/learners/learners.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { skillRepository } from '@/modules/skills/skills.module.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';

import {
  PlanTrackSnapshotRepository,
  type PlanTrackSnapshotTree,
} from '../repositories/plan-track-snapshot.repository.js';
import { TrainingPlanRepository } from '../repositories/training-plan.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/**
 * Wizard step2 — pick a track for a plan, get a plan-owned deep copy of that
 * track's level's skills/outcomes/content to freely edit without touching
 * the master catalogue. The plan's `LearnerAssignment` must already exist by
 * this point (created via the existing `learners` module's assign flow —
 * `POST /plans` already requires an active assignment today, so the wizard
 * calls that assign step, then `POST /plans`, then this snapshot-create
 * endpoint, in that order — no schema change needed to make a plan
 * assignment-optional). This service reads the track/level straight off the
 * plan's assignment rather than trusting caller-supplied ids, so a snapshot
 * can never diverge from what the plan is actually assigned to.
 *
 * Skills are sourced from the assignment's `levelId` (`Skill.levelId`), not
 * the track — skill ownership moved from Track-level (the old `TrackSkill`
 * join table) to Level-level. `PlanTrackSnapshot`/`PlanSkillSnapshot` keep
 * their existing track-scoped shape (denormalized copy fields, no live FK
 * back to `TrackSkill`), so no schema change was needed here — only this
 * query changes what it reads.
 */
export class PlanSnapshotService {
  private readonly snapshots = new PlanTrackSnapshotRepository();
  private readonly plans = new TrainingPlanRepository();

  async createFromMasterTrack(
    actor: ActingUser,
    trainingPlanId: string,
  ): Promise<PlanTrackSnapshotTree> {
    const plan = await this.plans.findByIdScoped(trainingPlanId);
    if (!plan) {
      throw new NotFoundError('Training plan not found');
    }

    const existing = await this.snapshots.findByTrainingPlanId(trainingPlanId);
    if (existing) {
      throw new ConflictError('This plan already has a track snapshot');
    }

    const assignment = await learnerAssignmentRepository.findByIdScoped(
      plan.assignmentId,
      actor.organizationId,
    );
    if (!assignment) {
      throw new NotFoundError('This plan’s learner assignment no longer exists');
    }

    const track = await trackRepository.findByIdScoped(assignment.trackId);
    if (!track) {
      throw new NotFoundError('The track behind this plan’s assignment no longer exists');
    }

    // ── deep-copy the level's catalogue into plan-scoped snapshot rows ──
    const levelSkills = await skillRepository.findByLevel(assignment.levelId);
    const skillIds = levelSkills.map((skill) => skill.id);

    const trackSkills = levelSkills.map((skill) => ({
      skillId: skill.id,
      nameEn: skill.nameEn,
      nameAr: skill.nameAr,
      descriptionEn: skill.descriptionEn,
      descriptionAr: skill.descriptionAr,
      levels: skill.levels,
    }));

    const outcomesBySkill = await outcomeRepository.findBySkillIds(skillIds);
    const outcomesBySkillId = new Map<string, typeof outcomesBySkill>();
    for (const outcome of outcomesBySkill) {
      if (!outcome.skillId) continue;
      const bucket = outcomesBySkillId.get(outcome.skillId) ?? [];
      bucket.push(outcome);
      outcomesBySkillId.set(outcome.skillId, bucket);
    }

    const contentBySkillId = new Map<string, { id: string; name: string }[]>();
    for (const skillId of skillIds) {
      const items = await contentItemRepository.findBySkill(skillId);
      if (items.length === 0) continue;
      contentBySkillId.set(
        skillId,
        items.map((item) => ({ id: item.id, name: item.name })),
      );
    }

    const tree = await this.snapshots.createFromMasterTrack({
      trainingPlanId,
      track: {
        id: track.id,
        nameEn: track.nameEn,
        nameAr: track.nameAr,
        descriptionEn: track.descriptionEn,
        descriptionAr: track.descriptionAr,
      },
      trackSkills,
      outcomesBySkillId,
      contentBySkillId,
    });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_track_snapshot.created',
      entityType: 'PlanTrackSnapshot',
      entityId: tree.id,
      after: { trainingPlanId, sourceTrackId: track.id, skillCount: trackSkills.length },
    });

    return tree;
  }

  async getTree(trainingPlanId: string): Promise<PlanTrackSnapshotTree> {
    const tree = await this.snapshots.findByTrainingPlanId(trainingPlanId);
    if (!tree) {
      throw new NotFoundError('This plan has no track snapshot yet');
    }
    return tree;
  }

  async addSkill(
    actor: ActingUser,
    trainingPlanId: string,
    dto: {
      nameEn: string;
      nameAr: string;
      descriptionEn: string;
      descriptionAr: string;
      levels: string[];
    },
  ) {
    const tree = await this.getTree(trainingPlanId);
    const levelId = await this.resolveAssignmentLevelId(trainingPlanId, actor.organizationId);

    // A manager-authored skill gets a real backing `Skill` + `Outcome` rather
    // than living only in the snapshot. `Session.primaryOutcomeId` is a hard
    // FK to the master `Outcome` table, so a snapshot-only skill produced no
    // schedulable session at all: `PlanBuilderService.generateFromSnapshotTree`
    // drops every outcome whose `sourceOutcomeId` is null, leaving the wizard
    // on a proposal row with no session behind it and no date/time pickers.
    //
    // Both rows are created `isEnabled: false` so they stay out of the org's
    // Training Management catalogue — they exist to satisfy the FK and to
    // carry this plan's own scheduling/reporting, not as reusable content.
    const masterSkill = await skillRepository.create({
      organizationId: actor.organizationId,
      // Deliberately NOT attached to the level. `Skill.levelId` is what makes
      // a skill part of a track's catalogue: `skillRepository.findByLevel`
      // ignores `isEnabled` and is read both by the Track Wizard and by
      // `PlanSnapshotService.create` when copying a level into a new plan —
      // so setting it here published this plan's private skill to the track
      // and to every future plan built from that level. Left null, the row
      // exists only to satisfy `Session.primaryOutcomeId`'s FK and is
      // reachable solely through this plan's own snapshot.
      levelId: null,
      // `Skill` is `@@unique([organizationId, key])`; a timestamp alone can
      // repeat within the same millisecond on a fast double-add.
      key: `plan-${trainingPlanId}-${randomUUID()}`,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      levels: dto.levels,
      isEnabled: false,
    } as never);

    const created = await this.snapshots.addSkill(tree.id, {
      sourceSkillId: masterSkill.id,
      ...dto,
    });

    // One outcome, owned by the skill (`Outcome.skillId`), created up front so
    // the skill is schedulable before the manager authors any of their own.
    // Adding outcomes later attaches them to this same master skill.
    const defaultOutcome = await outcomeRepository.create({
      levelId,
      skillId: masterSkill.id,
      titleEn: dto.nameEn,
      titleAr: dto.nameAr,
      targetSkills: [dto.nameEn],
      order: await this.nextOutcomeOrder(levelId),
      isEnabled: false,
    } as never);

    await this.snapshots.addOutcome(tree.id, created.id, {
      sourceOutcomeId: defaultOutcome.id,
      titleEn: dto.nameEn,
      titleAr: dto.nameAr,
      order: 1,
    });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_skill_snapshot.added',
      entityType: 'PlanSkillSnapshot',
      entityId: created.id,
      after: { trainingPlanId, nameEn: dto.nameEn, masterSkillId: masterSkill.id },
    });

    return created;
  }

  async updateSkill(
    actor: ActingUser,
    trainingPlanId: string,
    skillSnapshotId: string,
    dto: Partial<{
      nameEn: string;
      nameAr: string;
      descriptionEn: string;
      descriptionAr: string;
      levels: string[];
    }>,
  ) {
    await this.assertSkillBelongsToPlan(trainingPlanId, skillSnapshotId);
    const updated = await this.snapshots.updateSkill(skillSnapshotId, dto);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_skill_snapshot.updated',
      entityType: 'PlanSkillSnapshot',
      entityId: skillSnapshotId,
      after: dto,
    });

    return updated;
  }

  /** Soft-delete only — a plan-scoped snapshot row is never hard-deleted, same convention as the master catalogue. */
  async removeSkill(actor: ActingUser, trainingPlanId: string, skillSnapshotId: string) {
    await this.assertSkillBelongsToPlan(trainingPlanId, skillSnapshotId);
    const updated = await this.snapshots.updateSkill(skillSnapshotId, { isRemoved: true });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_skill_snapshot.removed',
      entityType: 'PlanSkillSnapshot',
      entityId: skillSnapshotId,
    });

    return updated;
  }

  async addOutcome(
    actor: ActingUser,
    trainingPlanId: string,
    skillSnapshotId: string,
    dto: {
      titleEn: string;
      titleAr: string;
      order: number;
    },
  ) {
    const tree = await this.getTree(trainingPlanId);
    await this.assertSkillBelongsToPlan(trainingPlanId, skillSnapshotId);

    // Backed by a real `Outcome` owned by this snapshot skill's master skill
    // (`Outcome.skillId`), for the same FK reason as `addSkill` above — a
    // `sourceOutcomeId: null` outcome is skipped by the plan builder and can
    // never drive a session. `isEnabled: false` keeps it out of the org's
    // catalogue; it belongs to the skill, not to any one session.
    const skillSnapshot = await this.snapshots.findSkillById(skillSnapshotId);
    const levelId = await this.resolveAssignmentLevelId(trainingPlanId, actor.organizationId);
    const masterOutcome = await outcomeRepository.create({
      levelId,
      skillId: skillSnapshot?.sourceSkillId ?? null,
      titleEn: dto.titleEn,
      titleAr: dto.titleAr,
      targetSkills: skillSnapshot ? [skillSnapshot.nameEn] : [],
      // Not `dto.order` — that is the snapshot's per-skill position (each
      // skill numbers its own outcomes 1, 2, 3…), which collides on the
      // master table's `@@unique([levelId, order])` as soon as two skills
      // both have a first outcome.
      order: await this.nextOutcomeOrder(levelId),
      isEnabled: false,
    } as never);

    const created = await this.snapshots.addOutcome(tree.id, skillSnapshotId, {
      sourceOutcomeId: masterOutcome.id,
      ...dto,
    });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_outcome_snapshot.added',
      entityType: 'PlanOutcomeSnapshot',
      entityId: created.id,
      after: { trainingPlanId, skillSnapshotId, titleEn: dto.titleEn },
    });

    return created;
  }

  async updateOutcome(
    actor: ActingUser,
    trainingPlanId: string,
    outcomeSnapshotId: string,
    dto: Partial<{
      titleEn: string;
      titleAr: string;
      order: number;
    }>,
  ) {
    await this.assertOutcomeBelongsToPlan(trainingPlanId, outcomeSnapshotId);
    const updated = await this.snapshots.updateOutcome(outcomeSnapshotId, dto);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_outcome_snapshot.updated',
      entityType: 'PlanOutcomeSnapshot',
      entityId: outcomeSnapshotId,
      after: dto,
    });

    return updated;
  }

  async removeOutcome(actor: ActingUser, trainingPlanId: string, outcomeSnapshotId: string) {
    await this.assertOutcomeBelongsToPlan(trainingPlanId, outcomeSnapshotId);
    const updated = await this.snapshots.updateOutcome(outcomeSnapshotId, { isRemoved: true });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_outcome_snapshot.removed',
      entityType: 'PlanOutcomeSnapshot',
      entityId: outcomeSnapshotId,
    });

    return updated;
  }

  async addContent(
    actor: ActingUser,
    trainingPlanId: string,
    dto: {
      skillSnapshotId: string | null;
      title: string;
      contentType: string;
      sourceUrl: string | null;
      textBody: string | null;
    },
  ) {
    const tree = await this.getTree(trainingPlanId);
    if (dto.skillSnapshotId) {
      await this.assertSkillBelongsToPlan(trainingPlanId, dto.skillSnapshotId);
    }
    const created = await this.snapshots.addContent(tree.id, { sourceContentId: null, ...dto });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_content_snapshot.added',
      entityType: 'PlanContentSnapshot',
      entityId: created.id,
      after: { trainingPlanId, title: dto.title },
    });

    return created;
  }

  async updateContent(
    actor: ActingUser,
    trainingPlanId: string,
    contentSnapshotId: string,
    dto: Partial<{ title: string; sourceUrl: string | null; textBody: string | null }>,
  ) {
    await this.assertContentBelongsToPlan(trainingPlanId, contentSnapshotId);
    const updated = await this.snapshots.updateContent(contentSnapshotId, dto);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_content_snapshot.updated',
      entityType: 'PlanContentSnapshot',
      entityId: contentSnapshotId,
      after: dto,
    });

    return updated;
  }

  async removeContent(actor: ActingUser, trainingPlanId: string, contentSnapshotId: string) {
    await this.assertContentBelongsToPlan(trainingPlanId, contentSnapshotId);
    const updated = await this.snapshots.updateContent(contentSnapshotId, { isRemoved: true });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_content_snapshot.removed',
      entityType: 'PlanContentSnapshot',
      entityId: contentSnapshotId,
    });

    return updated;
  }

  /**
   * Next free `Outcome.order` on a level. `@@unique([levelId, order])`
   * (schema.prisma) means a hardcoded order collides with whatever the level's
   * catalogue already uses — which surfaced as a bare 500 on
   * `POST /plans/:id/snapshot/skills`.
   */
  private async nextOutcomeOrder(levelId: string): Promise<number> {
    const existing = await outcomeRepository.findByLevel(levelId);
    return existing.reduce((max, o) => Math.max(max, o.order), 0) + 1;
  }

  /**
   * The `Level` this plan's learner is assigned to — where a manager-authored
   * skill has to be created, since `Skill.levelId` is what
   * `PlanSnapshotService.create` reads back when copying a level's catalogue.
   */
  private async resolveAssignmentLevelId(
    trainingPlanId: string,
    organizationId: string,
  ): Promise<string> {
    const plan = await this.plans.findByIdScoped(trainingPlanId);
    if (!plan) throw new NotFoundError('Training plan not found');
    const assignment = await learnerAssignmentRepository.findByIdScoped(
      plan.assignmentId,
      organizationId,
    );
    if (!assignment) {
      throw new NotFoundError('This plan’s learner assignment no longer exists');
    }
    return assignment.levelId;
  }

  private async assertSkillBelongsToPlan(
    trainingPlanId: string,
    skillSnapshotId: string,
  ): Promise<void> {
    const tree = await this.getTree(trainingPlanId);
    const skill = await this.snapshots.findSkillById(skillSnapshotId);
    if (!skill || skill.snapshotId !== tree.id) {
      throw new NotFoundError('Skill snapshot not found on this plan');
    }
  }

  private async assertOutcomeBelongsToPlan(
    trainingPlanId: string,
    outcomeSnapshotId: string,
  ): Promise<void> {
    const tree = await this.getTree(trainingPlanId);
    const outcome = await this.snapshots.findOutcomeById(outcomeSnapshotId);
    if (!outcome || outcome.snapshotId !== tree.id) {
      throw new NotFoundError('Outcome snapshot not found on this plan');
    }
  }

  private async assertContentBelongsToPlan(
    trainingPlanId: string,
    contentSnapshotId: string,
  ): Promise<void> {
    const tree = await this.getTree(trainingPlanId);
    const content = await this.snapshots.findContentById(contentSnapshotId);
    if (!content || content.snapshotId !== tree.id) {
      throw new NotFoundError('Content snapshot not found on this plan');
    }
  }
}
