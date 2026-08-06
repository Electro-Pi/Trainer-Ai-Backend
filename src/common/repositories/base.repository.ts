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
 * Prisma's own generic delegate type — with no models in the schema yet
 * (P1-1 owns the data model) there is nothing concrete to instantiate that
 * type against, and the generic `Prisma.TypeMap` machinery is not meant to
 * be parameterized by hand. Concrete repositories narrow `TDelegate` to
 * their real generated delegate type once models exist.
 */
export interface PrismaDelegate<
  T,
  WhereInput = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
> {
  findUnique(args: { where: WhereInput }): Promise<T | null>;
  findFirst(args: { where: WhereInput }): Promise<T | null>;
  findMany(args: {
    where?: WhereInput;
    take?: number;
    cursor?: WhereInput;
    skip?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<T[]>;
  create(args: { data: CreateInput }): Promise<T>;
  update(args: { where: WhereInput; data: UpdateInput }): Promise<T>;
  delete(args: { where: WhereInput }): Promise<T>;
}

/**
 * Shared CRUD + cursor pagination every module repository extends
 * (ARCHITECTURE §4.3). Tenant scoping (`organizationId` injected via the
 * Prisma client extension, §7.3) and the real soft-delete semantics behind
 * non-negotiable 17 land with P1-4, once concrete models exist to scope and
 * version. This class provides the shape; each module's repository supplies
 * its concrete `TDelegate`, id field and sort field.
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
