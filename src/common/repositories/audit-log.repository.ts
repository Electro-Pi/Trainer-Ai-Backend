import type { AuditLog } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type AuditLogDelegate = typeof prisma.auditLog;

/** Written inside the same transaction as every state change (non-negotiable 15). */
export class AuditLogRepository extends BaseRepository<AuditLog, AuditLogDelegate> {
  constructor() {
    super(prisma.auditLog, 'createdAt');
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return this.delegate.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
