import type { Assessment } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Assessment };

type AssessmentDelegate = typeof prisma.assessment;

/**
 * Not directly tenant-scoped — reached via `sessionId` → `Session.organizationId`.
 *
 * `Assessment` is created lazily on the first agent write that needs it
 * (notes, transcript, or `complete` — whichever the agent calls first isn't
 * fixed by the protocol), rather than at `start`, so a session that never
 * gets that far leaves no half-built `Assessment` row. `totalScore`/`verdict`
 * start at placeholder values and are overwritten for real by `complete`
 * (`P8-8`) — nothing reads them as meaningful before then.
 */
export class AssessmentRepository extends BaseRepository<Assessment, AssessmentDelegate> {
  constructor() {
    super(prisma.assessment, 'completedAt');
  }

  async findBySession(sessionId: string): Promise<Assessment | null> {
    return this.delegate.findFirst({ where: { sessionId } });
  }

  async findOrCreateForSession(sessionId: string): Promise<Assessment> {
    const existing = await this.findBySession(sessionId);
    if (existing) return existing;

    return this.delegate.create({
      data: {
        sessionId,
        totalScore: 0,
        verdict: 'NOT_ACHIEVED',
        strengths: '',
        gaps: '',
        agentNotes: '',
      },
    } as never);
  }

  /**
   * `cleanup.job` (§10.1) — GDPR transcript retention. `Assessment` is on the
   * hard-boundary list (never touch the row), so this only ever finds
   * candidates whose `transcriptRetentionUntil` has passed; the caller nulls
   * `transcriptUrl`/`transcriptRetentionUntil` via `clearExpiredTranscript`
   * after deleting the underlying blob, leaving the scoring record intact.
   */
  async findWithExpiredTranscripts(cutoff: Date, batchSize: number): Promise<Assessment[]> {
    return this.delegate.findMany({
      where: {
        transcriptUrl: { not: null },
        transcriptRetentionUntil: { lt: cutoff },
      },
      take: batchSize,
    });
  }

  async clearExpiredTranscript(id: string): Promise<void> {
    await this.delegate.update({
      where: { id } as never,
      data: { transcriptUrl: null, transcriptRetentionUntil: null } as never,
    });
  }

  /** Every transcript URL still on record (expired or not) — `cleanup.job`'s orphaned-blob sweep excludes these from deletion. */
  async findAllTranscriptUrls(): Promise<string[]> {
    const rows = await this.delegate.findMany({
      where: { transcriptUrl: { not: null } },
      take: 1_000_000,
    });
    return rows.map((row) => row.transcriptUrl).filter((url): url is string => url !== null);
  }
}
