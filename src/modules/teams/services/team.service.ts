import { ForbiddenError, NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
import { departmentRepository } from '@/modules/departments/departments.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type { CreateTeamDto, UpdateTeamDto } from '../dto/team.dto.js';
import { TeamRepository, type Team } from '../repositories/team.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `teams` module — P3-2. Manager ownership enforced here; row-level access (§7.2) is `requireTeamAccess()`'s job in the router. */
export class TeamService {
  private readonly teams = new TeamRepository();

  /** §7.2: a DEPARTMENT_MANAGER's list is filtered to teams they manage; ADMIN sees every team in the org. */
  async list(
    actor: ActingUser,
    limit: number,
    cursor: string | undefined,
  ): Promise<PageResult<Team>> {
    const where = actor.role === 'ADMIN' ? {} : { managerId: actor.id };
    return this.teams.findMany({ limit, ...(cursor ? { cursor } : {}), where });
  }

  async getById(id: string): Promise<Team> {
    const team = await this.teams.findByIdScoped(id);
    if (!team) {
      throw new NotFoundError('Team not found');
    }
    return team;
  }

  /** `TeamResponseDto.departmentName` read-through — resolves the readable name behind a team's `departmentId`. */
  async getDepartmentName(teamId: string): Promise<string | null> {
    return this.teams.findDepartmentName(teamId);
  }

  /**
   * Validates that `departmentId` names an active `Department` in the
   * caller's org before it's written to `Team.departmentId`. `Department`
   * isn't a tenant-scoped model on the Prisma extension (ARCHITECTURE §7.3),
   * so `organizationId` is filtered explicitly here — same reasoning
   * `TrackService.resolveDepartmentId` gives for its own unscoped read.
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
    return department.id;
  }

  private async resolveManagerId(
    actor: ActingUser,
    requested: string | undefined,
  ): Promise<string> {
    if (!requested) {
      if (actor.role !== 'DEPARTMENT_MANAGER') {
        throw new ValidationError([
          {
            path: 'managerId',
            code: 'required',
            message: 'managerId is required when the caller is not a DEPARTMENT_MANAGER',
          },
        ]);
      }
      return actor.id;
    }

    const manager = await portalUserRepository.findByIdScoped(requested);
    if (!manager || manager.role !== 'DEPARTMENT_MANAGER') {
      throw new ValidationError([
        {
          path: 'managerId',
          code: 'invalid',
          message: 'managerId must reference an active DEPARTMENT_MANAGER in this organization',
        },
      ]);
    }
    return manager.id;
  }

  async create(actor: ActingUser, dto: CreateTeamDto): Promise<Team> {
    const managerId = await this.resolveManagerId(actor, dto.managerId);
    const departmentId = await this.resolveDepartmentId(actor, dto.departmentId);

    const created = await this.teams.create({
      managerId,
      departmentId,
      name: dto.name,
      description: dto.description ?? null,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'team.created',
      entityType: 'Team',
      entityId: created.id,
      after: { name: created.name, managerId: created.managerId },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateTeamDto): Promise<Team> {
    const before = await this.getById(id);

    const managerId = dto.managerId ? await this.resolveManagerId(actor, dto.managerId) : undefined;
    const departmentId =
      dto.departmentId !== undefined
        ? await this.resolveDepartmentId(actor, dto.departmentId)
        : undefined;

    const updated = await this.teams.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(departmentId !== undefined ? { departmentId } : {}),
      ...(managerId !== undefined ? { managerId } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'team.updated',
      entityType: 'Team',
      entityId: id,
      before: { name: before.name, managerId: before.managerId },
      after: { name: updated.name, managerId: updated.managerId },
    });

    return updated;
  }

  /** No delete route is exposed — deleting a team would orphan its learners (non-negotiable 17). Managers reassign or deactivate learners instead. */
  async assertManages(actor: ActingUser, teamId: string): Promise<void> {
    if (actor.role === 'ADMIN') return;
    const team = await this.getById(teamId);
    if (team.managerId !== actor.id) {
      throw new ForbiddenError('You do not manage this team');
    }
  }
}
