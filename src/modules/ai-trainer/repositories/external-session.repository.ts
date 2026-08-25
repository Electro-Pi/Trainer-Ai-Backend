import type { ExternalSession } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { ExternalSession };

type ExternalSessionDelegate = typeof prisma.externalSession;

/**
 * `ExternalSession.id` is the AI Trainer service's own session id (uuid),
 * used directly as our PK rather than minting a separate cuid — see the
 * schema comment. `BaseRepository.create`'s generic `data` type still works
 * fine with an explicit `id` in the payload; Prisma just skips its `@default`.
 */
export class ExternalSessionRepository extends BaseRepository<
  ExternalSession,
  ExternalSessionDelegate
> {
  constructor() {
    super(prisma.externalSession, 'createdAt');
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, unscoped by the tenant
   * extension — same reasoning as every other module's `findByIdScoped`.
   */
  async findByIdScoped(id: string): Promise<ExternalSession | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /** Persists the webhook's payload (`POST /external-sessions/:id/complete`) — the raw evaluation/transcript JSON the AI Trainer pushes once the meeting ends. */
  async completeExternal(
    id: string,
    input: { evaluationPayload: unknown; transcriptPayload: unknown },
  ): Promise<ExternalSession> {
    return this.delegate.update({
      where: { id } as never,
      data: {
        evaluationPayload: input.evaluationPayload,
        transcriptPayload: input.transcriptPayload,
        completedAt: new Date(),
      } as never,
    });
  }

  async updateProgress(
    id: string,
    input: {
      status: string;
      currentSlideIndex: number | null;
      maxSlideIndexReached: number | null;
      questionsRecorded: number | null;
      startedAt: Date | null;
      endedAt: Date | null;
    },
  ): Promise<ExternalSession> {
    return this.delegate.update({
      where: { id } as never,
      data: {
        status: input.status,
        currentSlideIndex: input.currentSlideIndex,
        maxSlideIndexReached: input.maxSlideIndexReached,
        questionsRecorded: input.questionsRecorded,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      } as never,
    });
  }
}
