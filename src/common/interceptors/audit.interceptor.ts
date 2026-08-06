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

/**
 * Shape only — real audit writes start in P2-7, inside the same transaction
 * as the mutation they record (ARCHITECTURE §6.6). This stub exists so
 * services written before P2-7 can already call `writeAuditLog(...)` with
 * the final signature instead of being rewritten later.
 */
export type WriteAuditLog = (entry: AuditLogEntry) => Promise<void>;
