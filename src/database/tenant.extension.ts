import { Prisma } from '@prisma/client';

import { getCurrentOrganizationId } from '@/database/tenant-context.js';

// Every model that carries `organizationId` directly (ARCHITECTURE §5.2, §7.3).
// Models reached only through a parent (e.g. Level via Track, LearnerOutcome via
// Learner) are scoped transitively by their FK relation and are deliberately
// excluded — adding them here would require a `organizationId` column they don't have.
const TENANT_SCOPED_MODELS = new Set<string>([
  'PortalUser',
  'Team',
  'Learner',
  'Track',
  'ContentItem',
  'Recommendation',
  'TrainingPlan',
  'PlanTemplate',
  'Session',
  'Report',
  'AuditLog',
]);

const READ_OR_DELETE_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Injects `where: { organizationId }` into every read/update/delete on a
 * tenant-scoped model, and stamps `data.organizationId` on create — sourced
 * from `AsyncLocalStorage`, never from caller-supplied input. A query issued
 * outside `runWithTenant()` (no store set) is refused rather than silently
 * running unscoped, so cross-tenant leakage fails loudly instead of quietly.
 *
 * `findUnique`/`findUniqueOrThrow` are intentionally NOT scoped here — a
 * unique lookup by `id` alone cannot have `organizationId` merged into its
 * `where` without breaking Prisma's unique-input shape. Call sites that
 * resolve a single record by id must additionally verify the returned row's
 * `organizationId` themselves, or use `findFirst` instead.
 */
export function tenantExtension() {
  return Prisma.defineExtension({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const organizationId = getCurrentOrganizationId();
          if (!organizationId) {
            throw new Error(
              `Tenant-scoped query on "${model}.${operation}" ran outside runWithTenant() — refusing to execute unscoped.`,
            );
          }

          if (operation === 'create') {
            const createArgs = args as { data: Record<string, unknown> };
            createArgs.data = { ...createArgs.data, organizationId };
            return query(createArgs as never);
          }

          if (operation === 'createMany') {
            const createManyArgs = args as { data: Record<string, unknown>[] };
            createManyArgs.data = createManyArgs.data.map((row) => ({ ...row, organizationId }));
            return query(createManyArgs as never);
          }

          if (READ_OR_DELETE_OPERATIONS.has(operation)) {
            const scopedArgs = args as { where?: Record<string, unknown> };
            scopedArgs.where = { ...scopedArgs.where, organizationId };
            return query(scopedArgs as never);
          }

          return query(args);
        },
      },
    },
  });
}
