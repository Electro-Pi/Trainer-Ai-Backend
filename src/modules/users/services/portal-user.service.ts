import { ConflictError, ForbiddenError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
import { hashPassword } from '@/common/utils/password-hash.js';

import type { CreatePortalUserDto, UpdatePortalUserDto } from '../dto/portal-user.dto.js';
import { PortalUserRepository, type PortalUser } from '../repositories/portal-user.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/**
 * `users` module — P2-8. Role management here is the only place a
 * `PortalRole` is granted; ADMIN is the sole role allowed to call it
 * (enforced by the route's `authorize('ADMIN')`, not re-checked here, since
 * that guard already ran before the controller).
 */
export class PortalUserService {
  private readonly users = new PortalUserRepository();

  async list(limit: number, cursor: string | undefined): Promise<PageResult<PortalUser>> {
    return this.users.findMany(cursor ? { limit, cursor } : { limit });
  }

  async getById(id: string): Promise<PortalUser> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundError('Portal user not found');
    }
    return user;
  }

  async create(actor: ActingUser, dto: CreatePortalUserDto): Promise<PortalUser> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError('A portal user with this email already exists');
    }

    const passwordHash = dto.password ? await hashPassword(dto.password) : null;

    const created = await this.users.create({
      organizationId: actor.organizationId,
      email: dto.email,
      name: dto.name,
      role: dto.role,
      passwordHash,
      locale: dto.locale ?? 'EN',
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'user.created',
      entityType: 'PortalUser',
      entityId: created.id,
      after: { email: created.email, role: created.role },
    });

    return created;
  }

  async update(actor: ActingUser, targetId: string, dto: UpdatePortalUserDto): Promise<PortalUser> {
    const before = await this.getById(targetId);

    if (targetId === actor.id && dto.role && dto.role !== before.role) {
      throw new ForbiddenError('You cannot change your own role');
    }
    if (targetId === actor.id && dto.isActive === false) {
      throw new ForbiddenError('You cannot deactivate your own account');
    }

    const updated = await this.users.update(targetId, dto as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'user.updated',
      entityType: 'PortalUser',
      entityId: targetId,
      before: { role: before.role, isActive: before.isActive },
      after: { role: updated.role, isActive: updated.isActive },
    });

    return updated;
  }

  /** Non-negotiable 17 — deactivate, never hard-delete. */
  async deactivate(actor: ActingUser, targetId: string): Promise<PortalUser> {
    if (targetId === actor.id) {
      throw new ForbiddenError('You cannot deactivate your own account');
    }
    return this.update(actor, targetId, { isActive: false });
  }
}
