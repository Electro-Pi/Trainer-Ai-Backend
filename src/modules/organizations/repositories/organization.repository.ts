import type { Organization } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type OrganizationDelegate = typeof prisma.organization;

/**
 * Organization is the tenancy root — it carries no `organizationId` of its
 * own and is deliberately excluded from the tenant extension's scoped-model
 * list (ARCHITECTURE §7.3). Every read here is org-boundary-crossing by
 * necessity (auth resolving a tenant by `entraTenantId`, e.g.); callers must
 * not use this repository to fetch data belonging to a *different* org than
 * the caller's own — that boundary is enforced by every other repository.
 */
export class OrganizationRepository extends BaseRepository<Organization, OrganizationDelegate> {
  constructor() {
    super(prisma.organization, 'createdAt');
  }

  async findByEntraTenantId(entraTenantId: string): Promise<Organization | null> {
    return this.delegate.findFirst({ where: { entraTenantId } });
  }
}
