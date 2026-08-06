import { AsyncLocalStorage } from 'node:async_hooks';

// Carries the current request's organizationId across the async call chain so
// the Prisma client extension (tenant.extension.ts) can read it without every
// service/repository threading it through explicitly (ARCHITECTURE §7.3).
export const tenantStorage = new AsyncLocalStorage<{ organizationId: string }>();

/**
 * `fn` is awaited *inside* the ALS-bound frame, not just invoked. Prisma's
 * `create()`/`findMany()` etc. return a lazy `PrismaPromise` that only starts
 * executing once something calls `.then()` on it — if `fn`'s return value
 * were merely handed back out of `als.run()` without being awaited here, the
 * ALS context would already have exited by the time the query actually ran,
 * and every read/write would see an empty store.
 */
export async function runWithTenant<T>(
  organizationId: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return tenantStorage.run({ organizationId }, async () => await fn());
}

export function getCurrentOrganizationId(): string | undefined {
  return tenantStorage.getStore()?.organizationId;
}
