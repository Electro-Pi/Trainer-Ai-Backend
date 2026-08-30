import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
import { departmentRepository } from '@/modules/departments/departments.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import type {
  CreateFullTrackDto,
  CreateTrackDto,
  FullTrackResponseDto,
  TrackFilterDto,
  UpdateTrackDto,
} from '../dto/track.dto.js';
import { TrackRepository, type Track } from '../repositories/track.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `tracks` module — P4-1, P4-4, P4-5, P4-6. */
export class TrackService {
  private readonly tracks = new TrackRepository();

  /** §7.2: a DEPARTMENT_MANAGER's list is filtered to the department(s) of the team(s) they manage; ADMIN/CONTENT_CREATOR see every track in the org. */
  async list(actor: ActingUser, filter: TrackFilterDto): Promise<PageResult<Track>> {
    const departmentIds =
      actor.role === 'DEPARTMENT_MANAGER' ? await this.resolveManagedDepartmentIds(actor) : null;

    return this.tracks.findMany({
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
      ...(filter.cursor ? { cursor: filter.cursor } : {}),
      where: {
        ...(filter.isEnabled !== undefined ? { isEnabled: filter.isEnabled } : {}),
        ...(departmentIds ? { departmentId: { in: departmentIds } } : {}),
      },
    });
  }

  async getById(id: string): Promise<Track> {
    const track = await this.tracks.findByIdScoped(id);
    if (!track) {
      throw new NotFoundError('Track not found');
    }
    return track;
  }

  /** `TrackResponseDto.departmentName` read-through — resolves the readable name behind a track's `departmentId`. */
  async getDepartmentName(trackId: string): Promise<string | null> {
    return this.tracks.findDepartmentName(trackId);
  }

  /**
   * A DEPARTMENT_MANAGER has no `departmentId` field of their own — their
   * department(s) are derived from the team(s) they manage (`Team.managerId`
   * → `Team.departmentId`). A manager can end up owning teams across more
   * than one department (no DB constraint ties one manager to one
   * department), so this returns the full de-duplicated set rather than a
   * single id.
   */
  private async resolveManagedDepartmentIds(actor: ActingUser): Promise<string[]> {
    const teams = await teamRepository.findByManager(actor.id);
    return [...new Set(teams.map((t) => t.departmentId))];
  }

  /**
   * Validates that `departmentId` names an active `Department` in the
   * caller's org before it's written to `Track.departmentId`. `Department`
   * isn't a tenant-scoped model on the Prisma extension (ARCHITECTURE §7.3),
   * so `organizationId` is filtered explicitly here — same reasoning
   * `OrganizationRepository`'s doc comment gives for its own unscoped reads.
   *
   * For a DEPARTMENT_MANAGER, org-membership alone isn't enough — the
   * department must also be one they actually manage (§7.2), same ownership
   * rule `TeamService.assertManages` enforces for teams.
   */
  private async resolveDepartmentId(actor: ActingUser, departmentId: string): Promise<string> {
    const department = await departmentRepository.findByIdScoped(
      departmentId,
      actor.organizationId,
    );
    if (!department) {
      throw new ValidationError([
        {
          path: 'departmentId',
          code: 'invalid',
          message: 'departmentId must reference a department in this organization',
        },
      ]);
    }

    // A disabled department takes no new work. Same rule `setEnabled`'s doc
    // comment already states for a disabled Track — it "drops out of
    // recommendation/assignment eligibility but keeps its history" — applied
    // one level up: existing tracks under this department keep running, but
    // nothing new can be filed under it.
    if (!department.isEnabled) {
      throw new ValidationError([
        {
          path: 'departmentId',
          code: 'disabled',
          message: 'This department is disabled and cannot take new tracks',
        },
      ]);
    }

    if (actor.role === 'DEPARTMENT_MANAGER') {
      const managedDepartmentIds = await this.resolveManagedDepartmentIds(actor);
      if (!managedDepartmentIds.includes(department.id)) {
        throw new ValidationError([
          {
            path: 'departmentId',
            code: 'invalid',
            message: managedDepartmentIds.length
              ? 'departmentId must be a department you manage'
              : 'You must manage a team before creating tracks',
          },
        ]);
      }
    }

    return department.id;
  }

  async create(actor: ActingUser, dto: CreateTrackDto): Promise<Track> {
    const existing = await this.tracks.findByKey(dto.key);
    if (existing) {
      throw new ValidationError([
        { path: 'key', code: 'duplicate', message: 'A track with this key already exists' },
      ]);
    }

    const departmentId = await this.resolveDepartmentId(actor, dto.departmentId);

    const created = await this.tracks.create({
      key: dto.key,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      departmentId,
      targetSkills: dto.targetSkills,
      trainingForm: dto.trainingForm,
      impactIndicators: dto.impactIndicators,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.created',
      entityType: 'Track',
      entityId: created.id,
      after: { key: created.key, nameEn: created.nameEn },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateTrackDto): Promise<Track> {
    const before = await this.getById(id);

    const departmentId =
      dto.departmentId !== undefined
        ? await this.resolveDepartmentId(actor, dto.departmentId)
        : undefined;

    const updated = await this.tracks.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
      ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
      ...(departmentId !== undefined ? { departmentId } : {}),
      ...(dto.targetSkills !== undefined ? { targetSkills: dto.targetSkills } : {}),
      ...(dto.trainingForm !== undefined ? { trainingForm: dto.trainingForm } : {}),
      ...(dto.impactIndicators !== undefined ? { impactIndicators: dto.impactIndicators } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.updated',
      entityType: 'Track',
      entityId: id,
      before: { nameEn: before.nameEn },
      after: { nameEn: updated.nameEn },
    });

    return updated;
  }

  /** `TC-06` — enable/disable never deletes; a disabled track drops out of recommendation/assignment eligibility (both check `isEnabled`) but keeps its history. */
  async setEnabled(actor: ActingUser, id: string, isEnabled: boolean): Promise<Track> {
    const before = await this.getById(id);

    const updated = await this.tracks.update(id, { isEnabled } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: isEnabled ? 'track.enabled' : 'track.disabled',
      entityType: 'Track',
      entityId: id,
      before: { isEnabled: before.isEnabled },
      after: { isEnabled: updated.isEnabled },
    });

    return updated;
  }

  /** `TC-07` — deep copy of levels + outcomes; the copy starts disabled so it can be reviewed before going live. */
  async duplicate(actor: ActingUser, id: string, newKey: string): Promise<Track> {
    await this.getById(id);

    const existing = await this.tracks.findByKey(newKey);
    if (existing) {
      throw new ValidationError([
        { path: 'key', code: 'duplicate', message: 'A track with this key already exists' },
      ]);
    }

    const copy = await this.tracks.duplicate(id, newKey);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.duplicated',
      entityType: 'Track',
      entityId: copy.id,
      after: { sourceId: id, key: copy.key },
    });

    return copy;
  }

  /**
   * Hard delete — permitted for any track with no real learner plan
   * attached (`hasLearnerPlan`: no `LearnerAssignment`, no saved
   * `PlanTemplate`). Unlike the old empty-only rule, this cascades away the
   * track's own levels/skills/outcomes/content along with it — safe because
   * `hasLearnerPlan` returning false guarantees nothing with real learner
   * history (`Session`/`Assessment`/`Recommendation`/`LearnerOutcome`) can
   * reference any of it; every one of those requires a `LearnerAssignment`
   * to exist first (see `TrackRepository.deleteDeep`'s own doc comment). A
   * track with a real learner plan or a saved template still must be
   * archived (`setEnabled(false)`), never deleted.
   */
  async delete(actor: ActingUser, id: string): Promise<void> {
    const track = await this.getById(id);

    if (await this.tracks.hasLearnerPlan(id)) {
      throw new ValidationError([
        {
          path: 'id',
          code: 'has_learner_plan',
          message:
            'This track has a learner plan or a saved template attached and can’t be deleted. Archive it instead.',
        },
      ]);
    }

    await this.tracks.deleteDeep(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.deleted',
      entityType: 'Track',
      entityId: id,
      before: { key: track.key, nameEn: track.nameEn },
    });
  }

  /**
   * Track-creation wizard's Save action — validates `departmentId`, then
   * delegates the actual multi-model transaction to the repository (same
   * layering `duplicate()` above uses: service validates/orchestrates,
   * repository does the raw `tx` work). One audit row is written after the
   * transaction commits, summarizing the whole created tree.
   */
  async createFull(actor: ActingUser, dto: CreateFullTrackDto): Promise<FullTrackResponseDto> {
    const departmentId = await this.resolveDepartmentId(actor, dto.departmentId);

    const result = await this.tracks.createFull({ ...dto, departmentId }, actor.id);

    const skillCount = result.levels.reduce((sum, l) => sum + l.skills.length, 0);
    const outcomeCount = result.levels.reduce(
      (sum, l) => sum + l.skills.reduce((s, sk) => s + sk.outcomes.length, 0),
      0,
    );
    const contentCount = result.levels.reduce(
      (sum, l) => sum + l.skills.reduce((s, sk) => s + sk.content.length, 0),
      0,
    );

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.created',
      entityType: 'Track',
      entityId: result.track.id,
      after: {
        key: result.track.key,
        nameEn: result.track.nameEn,
        levelCount: result.levels.length,
        skillCount,
        outcomeCount,
        contentCount,
      },
    });

    return result;
  }

  /** `P4-6` — transactional full reorder; every id in `order` must belong to the caller's org. */
  async reorder(actor: ActingUser, order: string[]): Promise<void> {
    for (const id of order) {
      const track = await this.tracks.findByIdScoped(id);
      if (!track) {
        throw new ValidationError([
          { path: 'order', code: 'invalid', message: `Track ${id} not found in this organization` },
        ]);
      }
    }

    await this.tracks.reorder(order);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.reordered',
      entityType: 'Track',
      entityId: order[0] ?? 'n/a',
      after: { order },
    });
  }
}
