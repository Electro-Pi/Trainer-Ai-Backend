import { z } from 'zod';

import {
  cuidSchema,
  estimatedMinutesSchema,
  trainingDaysSchema,
} from '@/common/validators/primitives.js';

export const planIdParamsSchema = z.object({
  id: cuidSchema,
});

export const createTrainingPlanSchema = z.object({
  learnerId: cuidSchema,
  trainingDays: trainingDaysSchema,
  startDate: z.iso.datetime(),
  templateId: cuidSchema.optional(),
});

export const updateTrainingPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    trainingDays: trainingDaysSchema.optional(),
    startDate: z.iso.datetime().optional(),
    endDate: z.iso.datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'At least one field is required' });

export const suggestPlanSchema = z.object({
  sessionDurationMinutes: estimatedMinutesSchema.optional(),
});

export const savePlanTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const calendarQuerySchema = z.object({
  learnerId: cuidSchema.optional(),
  teamId: cuidSchema.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const planTemplateQuerySchema = z.object({
  trackId: cuidSchema,
  levelId: cuidSchema,
});
