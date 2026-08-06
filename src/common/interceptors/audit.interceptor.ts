import { AuditLogRepository } from '@/common/repositories/audit-log.repository.js';

export type AuditActorType = 'USER' | 'SYSTEM' | 'AGENT';

export interface AuditLogEntry {
  organizationId: string;
  actorId?: string;
  actorType: AuditActorType;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

export type WriteAuditLog = (entry: AuditLogEntry) => Promise<void>;

const auditLogs = new AuditLogRepository();

/**
 * Writes one `AuditLog` row (non-negotiable 15). Callers invoke this inside
 * the same Prisma transaction as the mutation it records — this function
 * itself has no transaction boundary of its own, since `BaseRepository`
 * calls go through the tenant-scoped Prisma client already bound to
 * whatever `$transaction` the caller is inside.
 */
export const writeAuditLog: WriteAuditLog = async (entry) => {
  await auditLogs.create({
    organizationId: entry.organizationId,
    actorId: entry.actorId ?? null,
    actorType: entry.actorType,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
  } as never);
};
