import { prisma } from '@/database/prisma.service.js';

/**
 * `ContentOutcome` is a pure join row keyed by `(contentItemId, outcomeId)` —
 * no single `id` column, so it cannot extend `BaseRepository<T extends {id}>`.
 * Enforcing "≥1 outcome per content item" (`CM-01`) is the `content` service's
 * job, not this repository's — this only persists/reads the join.
 */
export class ContentOutcomeRepository {
  async link(contentItemId: string, outcomeId: string): Promise<void> {
    await prisma.contentOutcome.create({ data: { contentItemId, outcomeId } });
  }

  async unlink(contentItemId: string, outcomeId: string): Promise<void> {
    await prisma.contentOutcome.delete({
      where: { contentItemId_outcomeId: { contentItemId, outcomeId } },
    });
  }

  async findByContentItem(contentItemId: string): Promise<{ outcomeId: string }[]> {
    return prisma.contentOutcome.findMany({
      where: { contentItemId },
      select: { outcomeId: true },
    });
  }

  async findByOutcome(outcomeId: string): Promise<{ contentItemId: string }[]> {
    return prisma.contentOutcome.findMany({
      where: { outcomeId },
      select: { contentItemId: true },
    });
  }
}
