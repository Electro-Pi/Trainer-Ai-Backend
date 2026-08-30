import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

export const reportIdParamsSchema = z.object({
  id: cuidSchema,
});

export const reportListQuerySchema = z.object({
  sessionId: cuidSchema.optional(),
  planId: cuidSchema.optional(),
  status: z.enum(['PENDING', 'GENERATED', 'SENT', 'FAILED']).optional(),
  // Page/limit rather than the shared cursor `paginationSchema`: the reports
  // table needs a total count and jump-to-page controls, which a cursor
  // can't express. Rows are also collapsed one-per-session before paging
  // (see the controller), so page boundaries can't be derived from a row
  // cursor anyway.
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Free-text match over learner name and outcome/skill title (both locales). */
  q: z.string().trim().max(200).optional(),
  verdict: z.enum(['ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED']).optional(),
  type: z.enum(['SESSION', 'PLAN_SUMMARY']).optional(),
});
