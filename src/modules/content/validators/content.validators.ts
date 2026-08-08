import { z } from 'zod';

import {
  cuidSchema,
  estimatedMinutesSchema,
  httpsUrlSchema,
  paginationSchema,
} from '@/common/validators/primitives.js';

const contentTypeSchema = z.enum(['DOCUMENT', 'SLIDES', 'TEXT', 'LINK', 'IMAGE']);
const languageSchema = z.enum(['EN', 'AR']);
const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
const contentStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']);

const titleSchema = z.string().trim().min(1).max(300);
const textBodySchema = z.string().trim().min(1).max(50_000);
const skillTagsSchema = z.array(z.string().trim().min(1).max(200)).max(50);

/**
 * `CM-02`/`CM-03` — conditional-required fields per content type: `TEXT`
 * needs `textBody`; `LINK` needs `sourceUrl`; `DOCUMENT`/`SLIDES`/`IMAGE`
 * carry their payload via `POST /content/:id/media` (P5-4), so neither field
 * is required at creation for those types.
 */
const baseCreateContentSchema = z.object({
  title: titleSchema,
  trackId: cuidSchema,
  levelId: cuidSchema,
  contentType: contentTypeSchema,
  textBody: textBodySchema.optional(),
  sourceUrl: httpsUrlSchema.optional(),
  language: languageSchema,
  estimatedMinutes: estimatedMinutesSchema,
  difficulty: difficultySchema,
  isMandatory: z.boolean().optional(),
  skillTags: skillTagsSchema.optional(),
  outcomeIds: z.array(cuidSchema).min(1, { error: 'At least one outcome is required (CM-01)' }),
});

export const createContentSchema = baseCreateContentSchema.check((ctx) => {
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

export const updateContentSchema = z.object({
  title: titleSchema.optional(),
  textBody: textBodySchema.optional(),
  sourceUrl: httpsUrlSchema.optional(),
  estimatedMinutes: estimatedMinutesSchema.optional(),
  difficulty: difficultySchema.optional(),
  isMandatory: z.boolean().optional(),
  skillTags: skillTagsSchema.optional(),
  outcomeIds: z.array(cuidSchema).min(1).optional(),
});

export const contentFilterSchema = paginationSchema.extend({
  trackId: cuidSchema.optional(),
  levelId: cuidSchema.optional(),
  status: contentStatusSchema.optional(),
  contentType: contentTypeSchema.optional(),
  language: languageSchema.optional(),
});

export const contentIdParamsSchema = z.object({
  id: cuidSchema,
});

export const bulkCreateContentSchema = z.object({
  items: z.array(baseCreateContentSchema).min(1).max(100),
  sharedTags: skillTagsSchema.optional(),
});

export const bulkMetadataEditSchema = z.object({
  contentItemIds: z.array(cuidSchema).min(1).max(200),
  skillTags: skillTagsSchema.optional(),
  difficulty: difficultySchema.optional(),
  isMandatory: z.boolean().optional(),
});

export const contentSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  language: languageSchema.optional(),
  trackId: cuidSchema.optional(),
  levelId: cuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const mediaIdParamsSchema = z.object({
  id: cuidSchema,
});
