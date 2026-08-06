import type { Team } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type TeamDelegate = typeof prisma.team;

export class TeamRepository extends BaseRepository<Team, TeamDelegate> {
  constructor() {
    super(prisma.team, 'createdAt');
  }

  async findByManager(managerId: string): Promise<Team[]> {
    return this.delegate.findMany({ where: { managerId } });
  }
}
