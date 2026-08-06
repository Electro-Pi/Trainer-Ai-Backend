import type { SessionContent } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type SessionContentDelegate = typeof prisma.sessionContent;

export class SessionContentRepository extends BaseRepository<
  SessionContent,
  SessionContentDelegate
> {
  constructor() {
    super(prisma.sessionContent, 'order');
  }

  async findBySession(sessionId: string): Promise<SessionContent[]> {
    return this.delegate.findMany({ where: { sessionId }, orderBy: { order: 'asc' } });
  }

  /** Marks delivery as the agent works through material — feeds `RC-14` + `PF-07` (P8-3b). */
  async markDelivered(id: string): Promise<SessionContent> {
    return prisma.sessionContent.update({ where: { id }, data: { deliveredAt: new Date() } });
  }
}
