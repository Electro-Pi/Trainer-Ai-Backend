import { z } from 'zod';

import { cuidSchema, weightSchema } from '@/common/validators/primitives.js';

const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
const languageSchema = z.enum(['EN', 'AR']);
const promptSchema = z.string().trim().min(1).max(2000);

const questionInputSchema = z.object({
  prompt: promptSchema,
  difficulty: difficultySchema,
  expectedAnswer: z.string().trim().max(2000).optional(),
  modelAnswer: z.string().trim().max(2000).optional(),
});

export const outcomeIdParamsSchema = z.object({
  id: cuidSchema,
});

export const upsertQuestionBankSchema = z.object({
  language: languageSchema,
  questions: z.array(questionInputSchema).min(1).max(100),
});

export const createQuestionSchema = z.object({
  questionBankId: cuidSchema,
  prompt: promptSchema,
  difficulty: difficultySchema,
  expectedAnswer: z.string().trim().max(2000).optional(),
  modelAnswer: z.string().trim().max(2000).optional(),
});

export const updateQuestionSchema = z.object({
  prompt: promptSchema.optional(),
  difficulty: difficultySchema.optional(),
  expectedAnswer: z.string().trim().max(2000).optional(),
  modelAnswer: z.string().trim().max(2000).optional(),
});

export const questionIdParamsSchema = z.object({
  id: cuidSchema,
});

const rubricCriterionInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(1000),
  weight: weightSchema,
});

/** `CM-11` — weights must sum to exactly 100; enforced here so a bad rubric never reaches the DB. */
export const upsertRubricSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    passThreshold: z.coerce.number().int().min(0).max(100),
    criteria: z.array(rubricCriterionInputSchema).min(1).max(20),
  })
  .check((ctx) => {
    const total = ctx.value.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (total !== 100) {
      ctx.issues.push({
        code: 'custom',
        message: `Rubric criteria weights must sum to 100 (got ${total})`,
        path: ['criteria'],
        input: ctx.value,
      });
    }
  });
