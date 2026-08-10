import { prisma } from '@/database/prisma.service.js';

/**
 * Not a `BaseRepository` subclass — `PkceEntry` is keyed by `state`, not the
 * `{ id: string }` shape `BaseRepository` assumes, and needs none of its
 * cursor-pagination/CRUD surface. Plain, focused repository instead.
 */
export class PkceEntryRepository {
  async upsert(state: string, codeVerifier: string, expiresAt: Date): Promise<void> {
    await prisma.pkceEntry.upsert({
      where: { state },
      create: { state, codeVerifier, expiresAt },
      update: { codeVerifier, expiresAt },
    });
  }

  async consume(state: string): Promise<{ codeVerifier: string; expiresAt: Date } | null> {
    return prisma.pkceEntry.delete({ where: { state } }).catch(() => null);
  }

  /** `cleanup.job` (§10.1) — expired login handshake rows. Not bounded-batch: `PkceEntry` volume is one row per in-flight login attempt, orders of magnitude below the batch-delete tables. */
  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.pkceEntry.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    return count;
  }
}
