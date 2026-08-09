import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

export const teamIdParamsSchema = z.object({
  teamId: cuidSchema,
});

export const learnerIdParamsSchema = z.object({
  id: cuidSchema,
});

/** `PF-09` — trends and both performance views share the same optional filter/compare set. */
export const analyticsFilterQuerySchema = z.object({
  trackId: cuidSchema.optional(),
  levelId: cuidSchema.optional(),
  skill: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const trendsQuerySchema = analyticsFilterQuerySchema.extend({
  teamId: cuidSchema.optional(),
  granularity: z.enum(['week', 'month']).default('week'),
});

export const contentUsageQuerySchema = z.object({
  trackId: cuidSchema.optional(),
  levelId: cuidSchema.optional(),
});

/** `PF-08` — export either a team or the whole org, as PDF or XLSX. */
export const exportQuerySchema = z
  .object({
    format: z.enum(['pdf', 'xlsx']),
    scope: z.enum(['team', 'organization']).default('organization'),
    teamId: cuidSchema.optional(),
  })
  .refine((data) => data.scope !== 'team' || data.teamId !== undefined, {
    message: 'teamId is required when scope is "team"',
    path: ['teamId'],
  });
