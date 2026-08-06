import { ForbiddenError, NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
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

  async list(limit: number, cursor: string | undefined): Promise<PageResult<Team>> {
    return this.teams.findMany(cursor ? { limit, cursor } : { limit });
  }

  async getById(id: string): Promise<Team> {
    const team = await this.teams.findByIdScoped(id);
    if (!team) {
      throw new NotFoundError('Team not found');
    }
    return team;
  }

  private async resolveManagerId(
    actor: ActingUser,
    requested: string | undefined,
  ): Promise<string> {
    if (!requested) {
      if (actor.role !== 'MANAGER') {
        throw new ValidationError([
          {
            path: 'managerId',
            code: 'required',
            message: 'managerId is required when the caller is not a MANAGER',
          },
        ]);
      }
      return actor.id;
    }

    const manager = await portalUserRepository.findByIdScoped(requested);
    if (!manager || manager.role !== 'MANAGER') {
      throw new ValidationError([
        {
          path: 'managerId',
          code: 'invalid',
          message: 'managerId must reference an active MANAGER in this organization',
        },
      ]);
    }
    return manager.id;
  }

  async create(actor: ActingUser, dto: CreateTeamDto): Promise<Team> {
    const managerId = await this.resolveManagerId(actor, dto.managerId);

    const created = await this.teams.create({
      managerId,
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

    const updated = await this.teams.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
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
    if (actor.role === 'ADMIN' || actor.role === 'HR') return;
    const team = await this.getById(teamId);
    if (team.managerId !== actor.id) {
      throw new ForbiddenError('You do not manage this team');
    }
  }
}
