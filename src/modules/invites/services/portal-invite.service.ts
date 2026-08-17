import { randomBytes } from 'node:crypto';

import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { portalUserRepository } from '@/modules/users/users.module.js';
import { queueService } from '@/queue/queue-instance.js';

import type { CreatePortalInviteDto } from '../dto/portal-invite.dto.js';
import {
  PortalInviteRepository,
  type PortalInvite,
} from '../repositories/portal-invite.repository.js';

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/**
 * Onboarding invites for MANAGER/CONTENT_MANAGER — ADMIN-only (enforced by
 * the route's `authorize('ADMIN')`, not re-checked here, same convention as
 * `PortalUserService`). Acceptance itself is folded into
 * `AuthService.signInWithMicrosoft`, not this module — see
 * `PortalInviteRepository.findByTokenUnscoped`.
 */
export class PortalInviteService {
  private readonly invites = new PortalInviteRepository();

  async create(actor: ActingUser, dto: CreatePortalInviteDto): Promise<PortalInvite> {
    const existingUser = await portalUserRepository.findByEmail(dto.email);
    if (existingUser && existingUser.organizationId === actor.organizationId) {
      throw new ConflictError('A portal user with this email already exists in your organization');
    }

    const existingInvites = await this.invites.findByOrganization(actor.organizationId);
    const duplicatePending = existingInvites.find(
      (invite) => invite.email === dto.email && invite.status === 'PENDING',
    );
    if (duplicatePending) {
      throw new ConflictError('An invite is already pending for this email');
    }

    const token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');

    const created = await this.invites.create({
      organizationId: actor.organizationId,
      email: dto.email,
      role: dto.role,
      invitedById: actor.id,
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'invite.created',
      entityType: 'PortalInvite',
      entityId: created.id,
      after: { email: created.email, role: created.role },
    });

    await queueService.enqueue(
      'invite.send',
      { portalInviteId: created.id, organizationId: actor.organizationId },
      { jobId: `invite-send-${created.id}` },
    );

    return created;
  }

  async list(actor: ActingUser): Promise<PortalInvite[]> {
    return this.invites.findByOrganization(actor.organizationId);
  }

  async revoke(actor: ActingUser, id: string): Promise<PortalInvite> {
    const invite = await this.invites.findById(id);
    if (!invite) {
      throw new NotFoundError('Invite not found');
    }
    if (invite.status !== 'PENDING') {
      throw new ConflictError('Only a pending invite can be revoked');
    }

    const updated = await this.invites.update(invite.id, { status: 'REVOKED' } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'invite.revoked',
      entityType: 'PortalInvite',
      entityId: invite.id,
    });

    return updated;
  }
}
