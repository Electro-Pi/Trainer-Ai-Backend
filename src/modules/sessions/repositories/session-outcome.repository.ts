import type { SessionOutcome } from '@prisma/client';

import { prisma } from '@/database/prisma.service.js';

/**
 * Composite-keyed `(sessionId, outcomeId)` — no single `id` column, so it
 * cannot extend `BaseRepository<T extends {id}>`. Carries carried-over
 * outcomes alongside a session's own (`OT-03`).
 */
export class SessionOutcomeRepository {
  async upsert(data: {
    sessionId: string;
    outcomeId: string;
    isCarriedOver?: boolean;
  }): Promise<SessionOutcome> {
    return prisma.sessionOutcome.upsert({
      where: { sessionId_outcomeId: { sessionId: data.sessionId, outcomeId: data.outcomeId } },
      create: { ...data, isCarriedOver: data.isCarriedOver ?? false },
      update: { isCarriedOver: data.isCarriedOver ?? false },
    });
  }

  async findBySession(sessionId: string): Promise<SessionOutcome[]> {
    return prisma.sessionOutcome.findMany({ where: { sessionId } });
  }
}
