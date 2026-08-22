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

  /** `TeamResponseDto.departmentName` read-through — resolves the readable name behind a team's `departmentId`. */
  async findDepartmentName(teamId: string): Promise<string | null> {
    const row = await prisma.team.findFirst({
      where: { id: teamId },
      select: { department: { select: { name: true } } },
    });
    return row?.department.name ?? null;
  }

  /** The delete guard's basis for "empty" — the only thing that ever references a team. */
  async countLearners(teamId: string): Promise<number> {
    return prisma.learner.count({ where: { teamId } });
  }

  /** `TeamResponseDto.pendingManagerInvite` read-through — resolves the invite behind a team's `pendingManagerInviteId`, if any. */
  async findPendingManagerInvite(teamId: string): Promise<{ id: string; email: string } | null> {
    const row = await prisma.team.findFirst({
      where: { id: teamId },
      select: { pendingManagerInvite: { select: { id: true, email: true } } },
    });
    return row?.pendingManagerInvite ?? null;
  }

  /**
   * Invite-accept resolution (`AuthService.signInWithMicrosoft`) — finds every
   * team still waiting on this invite so it can fill in the real `managerId`
   * once the invited manager signs in. `Team` is tenant-scoped (see
   * `tenant.extension.ts`), so the caller must wrap this in `runWithTenant(invite.organizationId, ...)`
   * — the invite is already known to belong to that org by this point.
   */
  async findByPendingManagerInvite(pendingManagerInviteId: string): Promise<Team[]> {
    return this.delegate.findMany({ where: { pendingManagerInviteId } });
  }
}
