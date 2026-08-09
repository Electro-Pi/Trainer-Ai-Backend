import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

export const reportIdParamsSchema = z.object({
  id: cuidSchema,
});

export const reportListQuerySchema = z.object({
  sessionId: cuidSchema.optional(),
  planId: cuidSchema.optional(),
  status: z.enum(['PENDING', 'GENERATED', 'SENT', 'FAILED']).optional(),
});
