import { ConflictError, NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';

import type { CreateDepartmentDto, UpdateDepartmentDto } from '../dto/department.dto.js';
import { DepartmentRepository, type Department } from '../repositories/department.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `departments` module — WS-02, Admin-only workspace-structure CRUD. */
export class DepartmentService {
  private readonly departments = new DepartmentRepository();

  async list(
    actor: ActingUser,
    limit: number,
    cursor: string | undefined,
  ): Promise<PageResult<Department>> {
    return this.departments.findManyInOrganization(actor.organizationId, limit, cursor);
  }

  async getById(actor: ActingUser, id: string): Promise<Department> {
    const department = await this.departments.findByIdScoped(id, actor.organizationId);
    if (!department) {
      throw new NotFoundError('Department not found');
    }
    return department;
  }

  async create(actor: ActingUser, dto: CreateDepartmentDto): Promise<Department> {
    const existing = await this.departments.findByNameEn(actor.organizationId, dto.nameEn);
    if (existing) {
      throw new ValidationError([
        {
          path: 'nameEn',
          code: 'duplicate',
          message: 'A department with this name already exists',
        },
      ]);
    }

    const created = await this.departments.create({
      organizationId: actor.organizationId,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'department.created',
      entityType: 'Department',
      entityId: created.id,
      after: { nameEn: created.nameEn, nameAr: created.nameAr, isEnabled: created.isEnabled },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const before = await this.getById(actor, id);

    if (dto.nameEn !== undefined && dto.nameEn !== before.nameEn) {
      const existing = await this.departments.findByNameEn(actor.organizationId, dto.nameEn);
      if (existing) {
        throw new ValidationError([
          {
            path: 'nameEn',
            code: 'duplicate',
            message: 'A department with this name already exists',
          },
        ]);
      }
    }

    const updated = await this.departments.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'department.updated',
      entityType: 'Department',
      entityId: id,
      before: { nameEn: before.nameEn, nameAr: before.nameAr, isEnabled: before.isEnabled },
      after: { nameEn: updated.nameEn, nameAr: updated.nameAr, isEnabled: updated.isEnabled },
    });

    return updated;
  }

  /**
   * Hard delete — deliberately narrower than non-negotiable 17's usual
   * deactivate/archive rule: a department with zero teams/tracks/learners
   * still attached has no history to lose, so removing the row outright
   * (rather than leaving a permanently-disabled placeholder in the list) is
   * safe. Any dependent still pointing at it blocks the delete instead of
   * silently orphaning `Team.departmentId`/`Track.departmentId` (both
   * required, non-nullable columns) or detaching learners from their
   * department.
   */
  async delete(actor: ActingUser, id: string): Promise<void> {
    const before = await this.getById(actor, id);
    const dependents = await this.departments.countDependents(id);
    const total = dependents.teams + dependents.tracks + dependents.learners;
    if (total > 0) {
      throw new ConflictError(
        `Can’t delete “${before.nameEn}” — it still has ${dependents.teams} team(s), ${dependents.tracks} track(s) and ${dependents.learners} learner(s) assigned. Move or remove them first.`,
      );
    }

    await this.departments.delete(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'department.deleted',
      entityType: 'Department',
      entityId: id,
      before: { nameEn: before.nameEn, nameAr: before.nameAr },
    });
  }
}
