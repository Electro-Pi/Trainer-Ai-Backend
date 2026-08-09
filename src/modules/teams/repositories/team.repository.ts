import type { Team } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

// Re-exported so services/controllers (banned from importing `@prisma/client`
// directly — D-12b) can still type against the model shape this repository
// returns.
export type { Team };

type TeamDelegate = typeof prisma.team;

export class TeamRepository extends BaseRepository<Team, TeamDelegate> {
  constructor() {
    super(prisma.team, 'createdAt');
  }

  async findByManager(managerId: string): Promise<Team[]> {
    return this.delegate.findMany({ where: { managerId } });
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * cannot scope even for a covered model like `Team` (see the extension's
   * doc comment) — a request-supplied `teamId` must resolve through this
   * `findFirst` instead, or a MANAGER in org A could read/manage a team
   * belonging to org B by guessing a CUID.
   */
  async findByIdScoped(id: string): Promise<Team | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /** `PF-02` org-wide analytics rollup — every team in the caller's org, unpaginated (bounded by org size, same reasoning as `OrganizationRepository.findAllIds`). */
  async findAllInOrganization(): Promise<Team[]> {
    return this.delegate.findMany({ take: 100_000, orderBy: { name: 'asc' } as never });
  }
}
