import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type { OrganizationResponseDto, UpdateOrganizationDto } from '../dto/organization.dto.js';
import { OrganizationService, type ActingUser } from '../services/organization.service.js';

const service = new OrganizationService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(
  org: Awaited<ReturnType<OrganizationService['getOwn']>>,
): OrganizationResponseDto {
  return {
    id: org.id,
    name: org.name,
    defaultLanguage: org.defaultLanguage,
    entraTenantId: org.entraTenantId,
    createdAt: org.createdAt.toISOString(),
  };
}

export class OrganizationController {
  async getOwn(req: Request, res: Response): Promise<void> {
    const org = await service.getOwn(req.auth!.orgId);
    res.status(200).json(toResponseDto(org));
  }

  async updateOwn(req: Request, res: Response): Promise<void> {
    const dto = req.body as UpdateOrganizationDto;
    const org = await service.updateOwn(toActingUser(req.auth!), dto);
    res.status(200).json(toResponseDto(org));
  }
}
