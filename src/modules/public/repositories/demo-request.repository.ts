import type { DemoRequest } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type DemoRequestDelegate = typeof prisma.demoRequest;

/** `WS-01` — the only unauthenticated write in the system. No `organizationId`; not tenant-scoped. */
export class DemoRequestRepository extends BaseRepository<DemoRequest, DemoRequestDelegate> {
  constructor() {
    super(prisma.demoRequest, 'createdAt');
  }
}
