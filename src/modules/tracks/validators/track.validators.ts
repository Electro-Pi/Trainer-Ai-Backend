import { z } from 'zod';

import { cuidSchema, paginationSchema, slugSchema } from '@/common/validators/primitives.js';

const trainingFormSchema = z.enum(['CONVERSATION', 'CASE', 'SIMULATION', 'ROLEPLAY']);

const bilingualTextSchema = z.string().trim().min(1).max(500);

export const createTrackSchema = z.object({
  key: slugSchema,
  nameEn: bilingualTextSchema,
  nameAr: bilingualTextSchema,
  descriptionEn: z.string().trim().min(1).max(4000),
  descriptionAr: z.string().trim().min(1).max(4000),
  departmentId: cuidSchema,
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1),
  trainingForm: trainingFormSchema,
  impactIndicators: z.array(z.string().trim().min(1).max(200)).min(1),
});

export const updateTrackSchema = z.object({
  nameEn: bilingualTextSchema.optional(),
  nameAr: bilingualTextSchema.optional(),
  descriptionEn: z.string().trim().min(1).max(4000).optional(),
  descriptionAr: z.string().trim().min(1).max(4000).optional(),
  departmentId: cuidSchema.optional(),
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1).optional(),
  trainingForm: trainingFormSchema.optional(),
  impactIndicators: z.array(z.string().trim().min(1).max(200)).min(1).optional(),
});

export const trackFilterSchema = paginationSchema.extend({
  isEnabled: z.coerce.boolean().optional(),
});

export const trackIdParamsSchema = z.object({
  id: cuidSchema,
});

export const setTrackEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

export const reorderTracksSchema = z.object({
  order: z.array(cuidSchema).min(1),
});

export const duplicateTrackSchema = z.object({
  key: slugSchema,
});

// ---- POST /tracks/full — bulk track-creation wizard ----

const levelKeySchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
const contentTypeSchema = z.enum(['DOCUMENT', 'SLIDES', 'TEXT', 'LINK', 'IMAGE']);
const languageSchema = z.enum(['EN', 'AR']);

const createFullOutcomeSchema = z.object({
  titleEn: bilingualTextSchema,
  titleAr: bilingualTextSchema,
});

const baseCreateFullContentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  contentType: contentTypeSchema,
  textBody: z.string().trim().min(1).max(50_000).optional(),
  sourceUrl: z
    .url()
    .max(2048)
    .refine((value) => value.startsWith('https://'), { error: 'URL must use https' })
    .optional(),
  language: languageSchema,
  outcomeIndexes: z.array(z.number().int().nonnegative()).min(1),
});

const createFullContentSchema = baseCreateFullContentSchema.check((ctx) => {
  const { contentType, textBody, sourceUrl } = ctx.value;
  if (contentType === 'TEXT' && !textBody) {
    ctx.issues.push({
      code: 'custom',
      message: 'textBody is required for TEXT content',
      path: ['textBody'],
      input: ctx.value,
    });
  }
  if (contentType === 'LINK' && !sourceUrl) {
    ctx.issues.push({
      code: 'custom',
      message: 'sourceUrl is required for LINK content',
      path: ['sourceUrl'],
      input: ctx.value,
    });
  }
});

const createFullSkillSchema = z
  .object({
    nameEn: bilingualTextSchema,
    nameAr: bilingualTextSchema,
    descriptionEn: z.string().trim().min(1).max(4000),
    descriptionAr: z.string().trim().min(1).max(4000),
    assessmentEnabled: z.boolean().optional(),
    outcomes: z
      .array(createFullOutcomeSchema)
      .min(1, { error: 'Each skill needs at least one outcome' }),
    content: z.array(createFullContentSchema),
  })
  .check((ctx) => {
    const { outcomes, content } = ctx.value;
    content.forEach((item, contentIndex) => {
      item.outcomeIndexes.forEach((idx) => {
        if (idx >= outcomes.length) {
          ctx.issues.push({
            code: 'custom',
            message: 'outcomeIndexes must reference an outcome defined on this skill',
            path: ['content', contentIndex, 'outcomeIndexes'],
            input: ctx.value,
          });
        }
      });
    });
  });

const createFullLevelSchema = z.object({
  key: levelKeySchema,
  skills: z
    .array(createFullSkillSchema)
    .min(1, { error: 'Each selected level needs at least one skill' }),
});

export const createFullTrackSchema = z
  .object({
    nameEn: bilingualTextSchema,
    nameAr: bilingualTextSchema,
    descriptionEn: z.string().trim().min(1).max(4000),
    descriptionAr: z.string().trim().min(1).max(4000),
    departmentId: cuidSchema,
    levels: z.array(createFullLevelSchema).min(1, { error: 'Select at least one level' }),
  })
  .check((ctx) => {
    const keys = ctx.value.levels.map((l) => l.key);
    if (new Set(keys).size !== keys.length) {
      ctx.issues.push({
        code: 'custom',
        message: 'Each level can only be selected once',
        path: ['levels'],
        input: ctx.value,
      });
    }
  });
