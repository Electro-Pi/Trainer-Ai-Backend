import { NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';

import type { UpdateOrganizationDto } from '../dto/organization.dto.js';
import { OrganizationRepository } from '../repositories/organization.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `organizations` module — real CRUD surface for the org's own profile (name, language). */
export class OrganizationService {
  private readonly organizations = new OrganizationRepository();

  async getOwn(organizationId: string) {
    const org = await this.organizations.findById(organizationId);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }
    return org;
  }

  async updateOwn(actor: ActingUser, dto: UpdateOrganizationDto) {
    const before = await this.getOwn(actor.organizationId);

    const updated = await this.organizations.update(actor.organizationId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.defaultLanguage !== undefined ? { defaultLanguage: dto.defaultLanguage } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'organization.updated',
      entityType: 'Organization',
      entityId: actor.organizationId,
      before: { name: before.name, defaultLanguage: before.defaultLanguage },
      after: { name: updated.name, defaultLanguage: updated.defaultLanguage },
    });

    return updated;
  }
}
