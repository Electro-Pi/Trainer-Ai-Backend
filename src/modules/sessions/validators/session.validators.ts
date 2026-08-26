import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

export const sessionIdParamsSchema = z.object({
  id: cuidSchema,
});

export const rescheduleSessionSchema = z
  .object({
    scheduledStart: z.iso.datetime(),
    scheduledEnd: z.iso.datetime(),
    silent: z.boolean().optional(),
  })
  .refine((value) => new Date(value.scheduledEnd) > new Date(value.scheduledStart), {
    error: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  })
  // `silent` reschedules are the plan wizard proposing a time while the
  // manager is still picking (per-click, before the plan is confirmed) —
  // not a real commitment yet, so a mid-pick value that happens to land in
  // the past (e.g. picking an earlier hour before reaching AM/PM) must not
  // 400. Only a non-silent reschedule (Sessions/Calendar screens, or the
  // wizard's own final confirm) is a real, user-committed change and gets
  // the future-time check.
  .refine((value) => value.silent || new Date(value.scheduledStart) > new Date(), {
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
