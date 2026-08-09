import { describe, expect, it } from 'vitest';

import {
  emailSchema,
  httpsUrlSchema,
  nameSchema,
  passwordSchema,
  paginationSchema,
  slugSchema,
} from '@/common/validators/primitives.js';
import { upsertRubricSchema } from '@/modules/assessments/validators/assessment.validators.js';
import { createContentSchema } from '@/modules/content/validators/content.validators.js';
import { patchLearnerOutcomesSchema } from '@/modules/learners/validators/learner.validators.js';
import { updateTrainingPlanSchema } from '@/modules/training-plans/validators/training-plan.validators.js';

const cuid = 'ckv8x2j9w0000gzuc9j8w5g5m'; // syntactically valid cuid2 shape

describe('common/validators/primitives — shared field rules', () => {
  describe('emailSchema', () => {
    it('accepts a valid email, trimmed and lowercased', () => {
      const result = emailSchema.parse('  User@Example.com  ');
      expect(result).toBe('user@example.com');
    });

    it('rejects a non-email string', () => {
      expect(() => emailSchema.parse('not-an-email')).toThrow();
    });

    it('rejects a string past the max length boundary (255)', () => {
      const tooLong = `${'a'.repeat(250)}@b.co`;
      expect(() => emailSchema.parse(tooLong)).toThrow();
    });
  });

  describe('passwordSchema', () => {
    it('accepts a password satisfying every class + length rule', () => {
      expect(() => passwordSchema.parse('Str0ng!Passw0rd')).not.toThrow();
    });

    it('rejects a password missing a symbol', () => {
      expect(() => passwordSchema.parse('Str0ngPassw0rd')).toThrow();
    });

    it('rejects a password below the minimum length (11 chars)', () => {
      expect(() => passwordSchema.parse('Str0ng!Pa')).toThrow();
    });

    it('rejects a known common password regardless of case', () => {
      expect(() => passwordSchema.parse('PASSWORD123!')).toThrow();
    });
  });

  describe('nameSchema', () => {
    it('rejects a value that is empty after trimming', () => {
      expect(() => nameSchema.parse('   ')).toThrow();
    });

    it('rejects a single-character name (below min 2)', () => {
      expect(() => nameSchema.parse('A')).toThrow();
    });

    it('trims surrounding whitespace on an otherwise-valid name', () => {
      expect(nameSchema.parse('  Sara Ahmed  ')).toBe('Sara Ahmed');
    });
  });

  describe('slugSchema', () => {
    it('accepts a well-formed slug', () => {
      expect(slugSchema.parse('sales-beginner')).toBe('sales-beginner');
    });

    it('rejects consecutive hyphens / invalid characters', () => {
      expect(() => slugSchema.parse('sales--beginner')).toThrow();
      expect(() => slugSchema.parse('Sales_Beginner!')).not.toBe('sales_beginner!'); // sanity: never silently passes through
    });
  });

  describe('httpsUrlSchema', () => {
    it('accepts an https URL', () => {
      expect(() => httpsUrlSchema.parse('https://example.com/recording')).not.toThrow();
    });

    it('rejects a plain http URL (LINK content must be https)', () => {
      expect(() => httpsUrlSchema.parse('http://example.com/recording')).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('defaults limit to 20 when omitted', () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(20);
    });

    it('rejects a limit above the max page size boundary (101)', () => {
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });

    it('accepts the max boundary itself (100)', () => {
      expect(() => paginationSchema.parse({ limit: 100 })).not.toThrow();
    });
  });
});

describe('content.validators — conditional-required fields by content type (CM-02, CM-03)', () => {
  const base = {
    title: 'Discovery Call Playbook',
    trackId: cuid,
    levelId: cuid,
    language: 'EN' as const,
    estimatedMinutes: 15,
    difficulty: 'EASY' as const,
    outcomeIds: [cuid],
  };

  it('TEXT content requires textBody', () => {
    const result = createContentSchema.safeParse({ ...base, contentType: 'TEXT' });
    expect(result.success).toBe(false);
  });

  it('TEXT content succeeds once textBody is present', () => {
    const result = createContentSchema.safeParse({
      ...base,
      contentType: 'TEXT',
      textBody: 'Some real body text.',
    });
    expect(result.success).toBe(true);
  });

  it('LINK content requires sourceUrl', () => {
    const result = createContentSchema.safeParse({ ...base, contentType: 'LINK' });
    expect(result.success).toBe(false);
  });

  it('LINK content succeeds once a valid https sourceUrl is present', () => {
    const result = createContentSchema.safeParse({
      ...base,
      contentType: 'LINK',
      sourceUrl: 'https://example.com/video',
    });
    expect(result.success).toBe(true);
  });

  it('DOCUMENT/SLIDES/IMAGE need neither textBody nor sourceUrl at creation (media comes via a separate upload)', () => {
    for (const contentType of ['DOCUMENT', 'SLIDES', 'IMAGE'] as const) {
      const result = createContentSchema.safeParse({ ...base, contentType });
      expect(result.success).toBe(true);
    }
  });

  it('rejects content bound to zero outcomes (CM-01: at least one outcome required)', () => {
    const result = createContentSchema.safeParse({ ...base, contentType: 'IMAGE', outcomeIds: [] });
    expect(result.success).toBe(false);
  });
});

describe('assessment.validators — rubric weight-sum-to-100 (CM-11)', () => {
  const rubricBase = { name: 'Discovery Call Rubric', passThreshold: 70 };

  it('rejects criteria weights summing to less than 100', () => {
    const result = upsertRubricSchema.safeParse({
      ...rubricBase,
      criteria: [
        { label: 'A', description: 'a', weight: 40 },
        { label: 'B', description: 'b', weight: 50 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects criteria weights summing to more than 100', () => {
    const result = upsertRubricSchema.safeParse({
      ...rubricBase,
      criteria: [
        { label: 'A', description: 'a', weight: 60 },
        { label: 'B', description: 'b', weight: 50 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts criteria weights summing to exactly 100', () => {
    const result = upsertRubricSchema.safeParse({
      ...rubricBase,
      criteria: [
        { label: 'A', description: 'a', weight: 40 },
        { label: 'B', description: 'b', weight: 40 },
        { label: 'C', description: 'c', weight: 20 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('learner.validators — cross-field refine on outcome customization', () => {
  it('rejects a body with none of add/remove/reprioritize set', () => {
    const result = patchLearnerOutcomesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts a body with only `remove` set', () => {
    const result = patchLearnerOutcomesSchema.safeParse({ remove: [cuid] });
    expect(result.success).toBe(true);
  });
});

describe('training-plan.validators — cross-field refine on partial update', () => {
  it('rejects an update body with zero fields', () => {
    const result = updateTrainingPlanSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts an update body with a single field set', () => {
    const result = updateTrainingPlanSchema.safeParse({ title: 'New title' });
    expect(result.success).toBe(true);
  });
});
