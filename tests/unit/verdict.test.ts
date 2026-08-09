import { describe, expect, it } from 'vitest';

import { VerdictService } from '@/modules/agent/services/verdict.service.js';

const verdict = new VerdictService();

describe('VerdictService.computeWeightedScore — LS-06', () => {
  it('returns 0 when there are no rubric criteria', () => {
    expect(verdict.computeWeightedScore([], [])).toBe(0);
  });

  it('computes a simple single-criterion, single-answer weighted score', () => {
    const score = verdict.computeWeightedScore(
      [[{ criterionId: 'c1', score: 80, maxScore: 100 }]],
      [{ id: 'c1', weight: 100 }],
    );
    expect(score).toBe(80);
  });

  it('weights two criteria correctly (40/60 split)', () => {
    const score = verdict.computeWeightedScore(
      [
        [
          { criterionId: 'c1', score: 100, maxScore: 100 },
          { criterionId: 'c2', score: 0, maxScore: 100 },
        ],
      ],
      [
        { id: 'c1', weight: 40 },
        { id: 'c2', weight: 60 },
      ],
    );
    // c1 contributes 1.0*40, c2 contributes 0*60 -> 40/100 = 40
    expect(score).toBe(40);
  });

  it('averages multiple scores for the same criterion across separate answers', () => {
    const score = verdict.computeWeightedScore(
      [
        [{ criterionId: 'c1', score: 100, maxScore: 100 }],
        [{ criterionId: 'c1', score: 0, maxScore: 100 }],
      ],
      [{ id: 'c1', weight: 100 }],
    );
    // avg ratio for c1 = (1.0 + 0.0) / 2 = 0.5 -> 50
    expect(score).toBe(50);
  });

  it('a criterion with zero recorded answers contributes zero, not undefined/NaN', () => {
    const score = verdict.computeWeightedScore(
      [[{ criterionId: 'c1', score: 100, maxScore: 100 }]],
      [
        { id: 'c1', weight: 50 },
        { id: 'c2', weight: 50 }, // never answered
      ],
    );
    // c1 contributes 1.0*50; c2 contributes 0 (skipped); total weight is still 100
    expect(score).toBe(50);
  });

  it('ignores a criterion score entry with maxScore <= 0 (guards a division by zero)', () => {
    const score = verdict.computeWeightedScore(
      [[{ criterionId: 'c1', score: 0, maxScore: 0 }]],
      [{ id: 'c1', weight: 100 }],
    );
    expect(score).toBe(0);
    expect(Number.isFinite(score)).toBe(true);
  });

  it('normalizes weights that do not sum to 100 (defensive, even though the validator enforces it upstream)', () => {
    const score = verdict.computeWeightedScore(
      [[{ criterionId: 'c1', score: 100, maxScore: 100 }]],
      [{ id: 'c1', weight: 50 }], // total weight 50, not 100
    );
    // weightedSum = 1.0*50 = 50; totalWeight = 50 -> 50/50 = 1.0 -> 100
    expect(score).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    const score = verdict.computeWeightedScore(
      [[{ criterionId: 'c1', score: 1, maxScore: 3 }]],
      [{ id: 'c1', weight: 100 }],
    );
    // 1/3 = 0.333... -> 33.33... -> rounds to 33
    expect(score).toBe(33);
  });

  it('a perfect score across three unevenly-weighted criteria is exactly 100', () => {
    const score = verdict.computeWeightedScore(
      [
        [
          { criterionId: 'c1', score: 100, maxScore: 100 },
          { criterionId: 'c2', score: 100, maxScore: 100 },
          { criterionId: 'c3', score: 100, maxScore: 100 },
        ],
      ],
      [
        { id: 'c1', weight: 40 },
        { id: 'c2', weight: 35 },
        { id: 'c3', weight: 25 },
      ],
    );
    expect(score).toBe(100);
  });
});

describe('VerdictService.deriveVerdict — partial-achievement threshold (60% of passThreshold)', () => {
  it('ACHIEVED at exactly the pass threshold (boundary is inclusive)', () => {
    expect(verdict.deriveVerdict(75, 75)).toBe('ACHIEVED');
  });

  it('ACHIEVED above the pass threshold', () => {
    expect(verdict.deriveVerdict(100, 75)).toBe('ACHIEVED');
  });

  it('PARTIALLY_ACHIEVED just below the pass threshold', () => {
    expect(verdict.deriveVerdict(74, 75)).toBe('PARTIALLY_ACHIEVED');
  });

  it('PARTIALLY_ACHIEVED at exactly 60% of the pass threshold (boundary is inclusive)', () => {
    // 60% of 75 = 45
    expect(verdict.deriveVerdict(45, 75)).toBe('PARTIALLY_ACHIEVED');
  });

  it('NOT_ACHIEVED just below 60% of the pass threshold', () => {
    expect(verdict.deriveVerdict(44, 75)).toBe('NOT_ACHIEVED');
  });

  it('NOT_ACHIEVED at a score of 0', () => {
    expect(verdict.deriveVerdict(0, 75)).toBe('NOT_ACHIEVED');
  });

  it('handles a passThreshold of 0 — every non-negative score achieves it', () => {
    expect(verdict.deriveVerdict(0, 0)).toBe('ACHIEVED');
  });

  it('handles a passThreshold of 100 — only a perfect score achieves it', () => {
    expect(verdict.deriveVerdict(99, 100)).toBe('PARTIALLY_ACHIEVED');
    expect(verdict.deriveVerdict(100, 100)).toBe('ACHIEVED');
  });
});
