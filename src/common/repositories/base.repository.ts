import type { CursorParts } from '@/common/utils/pagination.js';
import { decodeCursor, encodeCursor } from '@/common/utils/pagination.js';

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface FindManyOptions {
  limit?: number;
  cursor?: string;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * The minimal structural shape every generated Prisma model delegate
 * satisfies (`prisma.<model>`). Kept structural rather than importing
 * Prisma's own generic delegate type, whose `TypeMap` machinery isn't meant
 * to be parameterized by hand outside the generated client.
 *
 * `where`/`data` on the mutating methods are typed `never` on purpose.
 * Prisma's real per-model input types (`TrackWhereUniqueInput`,
 * `TrackUpdateInput`, ...) don't unify across models, and `BaseRepository`
 * never constructs those args from this interface — it either casts a bare
 * `{ id }` `as never` (findUnique/update/delete) or recovers the real
 * per-model type via `Parameters<TDelegate['create']>[0]['data']` (create).
 * `never` is assignable *to* any narrower real parameter type (parameters
 * are contravariant), so every generated delegate satisfies this shape.
 */
export interface PrismaDelegate<T, WhereInput = Record<string, unknown>> {
  findUnique(args: { where: never }): Promise<T | null>;
  findFirst(args: { where: WhereInput }): Promise<T | null>;
  findMany(args: {
    where?: WhereInput;
    take?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<T[]>;
  create(args: { data: never }): Promise<T>;
  update(args: { where: never; data: never }): Promise<T>;
  delete(args: { where: never }): Promise<T>;
}

/**
 * Shared CRUD + cursor pagination every module repository extends
 * (ARCHITECTURE §4.3). Tenant scoping is transparent: the Prisma client
 * passed in from `database/prisma.service.ts` is already wrapped in the
 * tenant-isolation extension (§7.3), so every call through `this.delegate`
 * is scoped by the request's `organizationId` without this class knowing
 * about tenancy at all. This class provides CRUD + pagination only; the
 * real soft-delete semantics behind non-negotiable 17 (deactivate/archive/
 * version, never hard-delete) are each module's responsibility to apply
 * before calling `.delete()`, which stays available for genuinely disposable
 * rows. Each module's repository supplies its concrete `TDelegate`, id field
 * and sort field.
 */
export abstract class BaseRepository<
  T extends { id: string },
  TDelegate extends PrismaDelegate<T> = PrismaDelegate<T>,
> {
  protected constructor(
    protected readonly delegate: TDelegate,
    protected readonly sortField: keyof T & string = 'id',
  ) {}

  async findById(id: string): Promise<T | null> {
    return this.delegate.findUnique({ where: { id } as never });
  }

  async findMany(options: FindManyOptions = {}): Promise<PageResult<T>> {
    const limit = options.limit ?? 20;
    const cursorParts: CursorParts | null = options.cursor ? decodeCursor(options.cursor) : null;

    const where = {
      ...(options.where ?? {}),
      ...(cursorParts ? { [this.sortField]: { gt: cursorParts.sortValue } } : {}),
    } as never;

    const rows = await this.delegate.findMany({
      where,
      take: limit + 1,
      orderBy: options.orderBy ?? ({ [this.sortField]: 'asc' } as Record<string, 'asc' | 'desc'>),
    });

    const hasNextPage = rows.length > limit;
    const data = hasNextPage ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];

    const nextCursor =
      hasNextPage && last
        ? encodeCursor({ sortValue: String(last[this.sortField]), id: last.id })
        : null;

    return { data, nextCursor, hasNextPage };
  }

  async create(data: Parameters<TDelegate['create']>[0]['data']): Promise<T> {
    return this.delegate.create({ data });
  }

  async update(id: string, data: Parameters<TDelegate['update']>[0]['data']): Promise<T> {
    return this.delegate.update({ where: { id } as never, data });
  }

  /**
   * Hard delete at the Prisma level — non-negotiable 17 requires callers to
   * prefer deactivate/archive/version. This exists for genuinely disposable
   * rows (e.g. expired refresh tokens); business-entity repositories should
   * not expose it directly.
   */
  async delete(id: string): Promise<T> {
    return this.delegate.delete({ where: { id } as never });
  }
}
