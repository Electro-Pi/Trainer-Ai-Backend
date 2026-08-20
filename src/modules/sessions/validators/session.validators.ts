import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

export const sessionIdParamsSchema = z.object({
  id: cuidSchema,
});

export const rescheduleSessionSchema = z
  .object({
    scheduledStart: z.iso.datetime(),
    scheduledEnd: z.iso.datetime(),
  })
  .refine((value) => new Date(value.scheduledEnd) > new Date(value.scheduledStart), {
    error: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  })
  .refine((value) => new Date(value.scheduledStart) > new Date(), {
    error: 'scheduledStart must be in the future',
    path: ['scheduledStart'],
  });

export const sessionListQuerySchema = z.object({
  learnerId: cuidSchema.optional(),
  teamId: cuidSchema.optional(),
  status: z
    .enum(['SCHEDULED', 'INVITED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
    .optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const calendarQuerySchema = z.object({
  learnerId: cuidSchema.optional(),
  teamId: cuidSchema.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
