import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type { CreatePortalInviteDto, PortalInviteResponseDto } from '../dto/portal-invite.dto.js';
import type { PortalInvite } from '../repositories/portal-invite.repository.js';
import { PortalInviteService, type ActingUser } from '../services/portal-invite.service.js';

const service = new PortalInviteService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(invite: PortalInvite): PortalInviteResponseDto {
  return {
    id: invite.id,
    organizationId: invite.organizationId,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    invitedById: invite.invitedById,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}

export class PortalInviteController {
  async list(req: Request, res: Response): Promise<void> {
    const invites = await service.list(toActingUser(req.auth!));
    res.status(200).json(invites.map(toResponseDto));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreatePortalInviteDto;
    const invite = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(toResponseDto(invite));
  }

  async revoke(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const invite = await service.revoke(toActingUser(req.auth!), id);
    res.status(200).json(toResponseDto(invite));
  }
}
