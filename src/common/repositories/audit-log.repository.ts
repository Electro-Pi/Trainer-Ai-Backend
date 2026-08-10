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

  /** `cleanup.job` (§10.1) — audit rows past the org's `auditRetentionDays`. Bounded batch delete. */
  async deleteOlderThan(organizationId: string, cutoff: Date, batchSize: number): Promise<number> {
    const stale = await this.delegate.findMany({
      where: { organizationId, createdAt: { lt: cutoff } },
      take: batchSize,
    });
    if (stale.length === 0) return 0;

    await prisma.auditLog.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
    return stale.length;
  }
}
