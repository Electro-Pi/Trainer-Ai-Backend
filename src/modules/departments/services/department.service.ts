import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
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
    const existing = await this.departments.findByName(actor.organizationId, dto.name);
    if (existing) {
      throw new ValidationError([
        { path: 'name', code: 'duplicate', message: 'A department with this name already exists' },
      ]);
    }

    const created = await this.departments.create({
      organizationId: actor.organizationId,
      name: dto.name,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'department.created',
      entityType: 'Department',
      entityId: created.id,
      after: { name: created.name },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const before = await this.getById(actor, id);

    if (dto.name !== undefined && dto.name !== before.name) {
      const existing = await this.departments.findByName(actor.organizationId, dto.name);
      if (existing) {
        throw new ValidationError([
          {
            path: 'name',
            code: 'duplicate',
            message: 'A department with this name already exists',
          },
        ]);
      }
    }

    const updated = await this.departments.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'department.updated',
      entityType: 'Department',
      entityId: id,
      before: { name: before.name, isEnabled: before.isEnabled },
      after: { name: updated.name, isEnabled: updated.isEnabled },
    });

    return updated;
  }
}
