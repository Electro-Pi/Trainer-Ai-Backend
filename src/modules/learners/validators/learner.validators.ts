import { z } from 'zod';

import {
  cuidSchema,
  emailSchema,
  nameSchema,
  paginationSchema,
  sortOrderSchema,
} from '@/common/validators/primitives.js';

const localeSchema = z.enum(['EN', 'AR']);
const jobFieldSchema = z.string().trim().min(1).max(200);

export const importLearnerSchema = z.object({
  entraObjectId: z.string().trim().min(1).max(200),
  email: emailSchema,
  displayName: nameSchema,
  jobTitle: jobFieldSchema.optional(),
  department: jobFieldSchema.optional(),
  preferredLanguage: localeSchema.optional(),
});

export const importLearnersSchema = z.object({
  learners: z.array(importLearnerSchema).min(1).max(500),
});

export const importLearnersCsvSchema = z.object({
  csv: z.string().trim().min(1).max(2_000_000),
});

export const updateLearnerSchema = z.object({
  jobTitle: jobFieldSchema.optional(),
  department: jobFieldSchema.optional(),
  preferredLanguage: localeSchema.optional(),
});

export const learnerFilterSchema = paginationSchema.extend({
  teamId: cuidSchema.optional(),
});

export const learnerIdParamsSchema = z.object({
  id: cuidSchema,
});

export const teamIdParamsSchema = z.object({
  id: cuidSchema,
});

export const putLearnerExperienceSchema = z.object({
  background: z.string().trim().min(1).max(4000),
  yearsOfExperience: z.coerce.number().int().min(0).max(60),
  priorTraining: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const assignLearnerSchema = z.object({
  trackId: cuidSchema,
  levelId: cuidSchema,
});

export const patchLearnerOutcomesSchema = z
  .object({
    add: z.array(cuidSchema).max(100).optional(),
    remove: z.array(cuidSchema).max(100).optional(),
    reprioritize: z
      .array(z.object({ outcomeId: cuidSchema, priority: sortOrderSchema }))
      .max(100)
      .optional(),
  })
  .refine((value) => value.add ?? value.remove ?? value.reprioritize, {
    error: 'At least one of add, remove or reprioritize must be provided',
  });

export const learnerOutcomeFilterSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'NOT_ACHIEVED']).optional(),
});
