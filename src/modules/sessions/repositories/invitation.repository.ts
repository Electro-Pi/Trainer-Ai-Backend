import type { Invitation } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type InvitationDelegate = typeof prisma.invitation;

export class InvitationRepository extends BaseRepository<Invitation, InvitationDelegate> {
  constructor() {
    super(prisma.invitation, 'sentAt');
  }

  async findBySession(sessionId: string): Promise<Invitation | null> {
    return this.delegate.findFirst({ where: { sessionId } });
  }
}
