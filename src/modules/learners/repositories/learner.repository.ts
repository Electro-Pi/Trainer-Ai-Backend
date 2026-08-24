import type { Learner } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Learner };

type LearnerDelegate = typeof prisma.learner;

export class LearnerRepository extends BaseRepository<Learner, LearnerDelegate> {
  constructor() {
    super(prisma.learner, 'createdAt');
  }

  async findByTeam(teamId: string): Promise<Learner[]> {
    return this.delegate.findMany({ where: { teamId } });
  }

  async findByEntraObjectId(entraObjectId: string): Promise<Learner | null> {
    return this.delegate.findFirst({ where: { entraObjectId } });
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * cannot scope even though `Learner` is a tenant-scoped model (see the
   * extension's own doc comment) — a request-supplied `learnerId` must
   * resolve through this `findFirst` instead, or a MANAGER in org A could
   * read/mutate a learner belonging to org B by guessing a CUID.
   */
  async findByIdScoped(id: string): Promise<Learner | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /** Batched form of `findByIdScoped` — `Learner` is directly tenant-scoped, so `findMany` is safe. */
  async findManyByIds(ids: string[]): Promise<Learner[]> {
    if (ids.length === 0) return [];
    return this.delegate.findMany({ where: { id: { in: ids } } });
  }

  /**
   * `Learner.departmentId` read-through for `LearnerResponseDto.departmentName`
   * — same join-for-a-name pattern as `TrackRepository.findDepartmentName`.
   * `Learner.departmentId` is independently nullable from `Learner.teamId`
   * (a learner can join a team without ever getting their own department
   * set explicitly), but `Team.departmentId` is required — every team
   * belongs to exactly one department. Falling back to the learner's team's
   * department means "—" only shows when neither the learner nor their team
   * has one, rather than whenever the learner's own field happens to be
   * unset despite already being on a team with a real department.
   */
  async findDepartmentName(learnerId: string): Promise<string | null> {
    const row = await prisma.learner.findFirst({
      where: { id: learnerId },
      select: {
        department: { select: { nameEn: true } },
        team: { select: { department: { select: { nameEn: true } } } },
      },
    });
    return row?.department?.nameEn ?? row?.team.department.nameEn ?? null;
  }
}
