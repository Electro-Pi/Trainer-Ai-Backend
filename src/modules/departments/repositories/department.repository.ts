import type { Department } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

// Re-exported so services/controllers (banned from importing `@prisma/client`
// directly — D-12b) can still type against the model shape this repository
// returns.
export type { Department };

type DepartmentDelegate = typeof prisma.department;

/**
 * `Department` is deliberately not in the tenant extension's
 * `TENANT_SCOPED_MODELS` set (see `tenant.extension.ts`'s own doc comment on
 * why — same reasoning `OrganizationRepository` gives for its own unscoped
 * reads), so every method here filters `organizationId` explicitly rather
 * than relying on `this.delegate` to inject it.
 */
export class DepartmentRepository extends BaseRepository<Department, DepartmentDelegate> {
  constructor() {
    super(prisma.department, 'nameEn');
  }

  async findManyInOrganization(organizationId: string, limit: number, cursor?: string) {
    return this.findMany({
      limit,
      ...(cursor ? { cursor } : {}),
      where: { organizationId },
    });
  }

  async findByIdScoped(id: string, organizationId: string): Promise<Department | null> {
    return this.delegate.findFirst({ where: { id, organizationId } as never });
  }

  async findByNameEn(organizationId: string, nameEn: string): Promise<Department | null> {
    return this.delegate.findFirst({ where: { organizationId, nameEn } as never });
  }

  /** Counts of what's still attached to this department — the delete guard's basis for "empty". */
  async countDependents(id: string): Promise<{ teams: number; tracks: number; learners: number }> {
    const [teams, tracks, learners] = await Promise.all([
      prisma.team.count({ where: { departmentId: id } }),
      prisma.track.count({ where: { departmentId: id } }),
      prisma.learner.count({ where: { departmentId: id } }),
    ]);
    return { teams, tracks, learners };
  }
}
