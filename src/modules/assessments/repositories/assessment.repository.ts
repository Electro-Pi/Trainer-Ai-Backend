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
}
