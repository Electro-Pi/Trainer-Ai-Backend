import type { PortalUser } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type PortalUserDelegate = typeof prisma.portalUser;

export class PortalUserRepository extends BaseRepository<PortalUser, PortalUserDelegate> {
  constructor() {
    super(prisma.portalUser, 'createdAt');
  }

  async findByEmail(email: string): Promise<PortalUser | null> {
    return this.delegate.findFirst({ where: { email } });
  }

  async findByEntraObjectId(entraObjectId: string): Promise<PortalUser | null> {
    return this.delegate.findFirst({ where: { entraObjectId } });
  }
}
