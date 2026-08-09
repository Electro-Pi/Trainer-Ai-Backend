import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

export const learnerIdParamsSchema = z.object({
  id: cuidSchema,
});

export const recommendationIdParamsSchema = z.object({
  id: cuidSchema,
});

export const recommendationItemParamsSchema = z.object({
  id: cuidSchema,
  itemId: cuidSchema,
});

export const itemActionSchema = z
  .object({
    action: z.enum(['ACCEPT', 'REJECT', 'REORDER', 'REPLACE']),
    rank: z.number().int().min(0).optional(),
    replacementContentItemId: cuidSchema.optional(),
  })
  .check((ctx) => {
    const { action, rank, replacementContentItemId } = ctx.value;
    if (action === 'REORDER' && rank === undefined) {
      ctx.issues.push({
        code: 'custom',
        message: 'rank is required for a REORDER action',
        path: ['rank'],
        input: ctx.value,
      });
    }
    if (action === 'REPLACE' && !replacementContentItemId) {
      ctx.issues.push({
        code: 'custom',
        message: 'replacementContentItemId is required for a REPLACE action',
        path: ['replacementContentItemId'],
        input: ctx.value,
      });
    }
  });
