import { describe, expect, it } from 'vitest';

import type { WebhookOutcomeResult } from '@/modules/ai-trainer/dto/ai-trainer.dto.js';
import { mapOutcomeResults } from '@/modules/ai-trainer/services/outcome-result-mapper.js';

function aiResult(over: Partial<WebhookOutcomeResult> = {}): WebhookOutcomeResult {
  return {
    outcome: 'Can design RESTful endpoints',
    questions_asked: 4,
    questions_correct: 4,
    passed: true,
    ...over,
  };
}

const outcome = (id: string, titleEn: string, titleAr = '') => ({
  outcomeId: id,
  titleEn,
  titleAr,
});

describe('mapOutcomeResults — per-outcome scoring', () => {
  it('gives each outcome its own verdict rather than one shared value', () => {
    const { verdicts } = mapOutcomeResults(
      [outcome('o1', 'Can design RESTful endpoints'), outcome('o2', 'Can configure DI containers')],
      [
        aiResult({ outcome: 'Can design RESTful endpoints', passed: true }),
        aiResult({ outcome: 'Can configure DI containers', passed: false }),
      ],
    );

    expect(verdicts).toEqual([
      { outcomeId: 'o1', score: 100, verdict: 'ACHIEVED' },
      { outcomeId: 'o2', score: 0, verdict: 'NOT_ACHIEVED' },
    ]);
  });

  it('scores a fully-unanswered outcome 0 / NOT_ACHIEVED', () => {
    const { verdicts } = mapOutcomeResults(
      [outcome('o1', 'Can evaluate a classification model')],
      [
        aiResult({
          outcome: 'Can evaluate a classification model',
          questions_asked: 3,
          questions_correct: 0,
          passed: false,
        }),
      ],
    );

    expect(verdicts).toEqual([{ outcomeId: 'o1', score: 0, verdict: 'NOT_ACHIEVED' }]);
  });

  it('treats an outcome the AI never asked about as NOT_ACHIEVED, not an inherited average', () => {
    const { verdicts } = mapOutcomeResults(
      [outcome('o1', 'Untouched outcome')],
      [
        aiResult({
          outcome: 'Untouched outcome',
          questions_asked: 0,
          questions_correct: 0,
          passed: false,
        }),
      ],
    );

    expect(verdicts).toEqual([{ outcomeId: 'o1', score: 0, verdict: 'NOT_ACHIEVED' }]);
  });

  it('follows `passed`, not the tally, when the two disagree', () => {
    // Every question right but the AI judged the outcome not demonstrated:
    // its verdict wins, because `passed` is the source of truth.
    const { verdicts } = mapOutcomeResults(
      [outcome('o1', 'Borderline outcome')],
      [
        aiResult({
          outcome: 'Borderline outcome',
          questions_asked: 4,
          questions_correct: 4,
          passed: false,
        }),
      ],
    );

    expect(verdicts[0]).toEqual({ outcomeId: 'o1', score: 0, verdict: 'NOT_ACHIEVED' });
  });

  it('awards full marks on a partial tally when the AI passed the outcome', () => {
    // 3 of 4 correct but `passed: true` -> ACHIEVED. Scoring is binary from
    // this flow by design; partial credit is not represented.
    const { verdicts } = mapOutcomeResults(
      [outcome('o1', 'Three of four')],
      [
        aiResult({
          outcome: 'Three of four',
          questions_asked: 4,
          questions_correct: 3,
          passed: true,
        }),
      ],
    );

    expect(verdicts[0]).toEqual({ outcomeId: 'o1', score: 100, verdict: 'ACHIEVED' });
  });

  it('never returns PARTIALLY_ACHIEVED from this flow', () => {
    const { verdicts } = mapOutcomeResults(
      [outcome('o1', 'A'), outcome('o2', 'B'), outcome('o3', 'C')],
      [
        aiResult({ outcome: 'A', passed: true, questions_asked: 2, questions_correct: 1 }),
        aiResult({ outcome: 'B', passed: false, questions_asked: 2, questions_correct: 1 }),
        aiResult({ outcome: 'C', passed: false, questions_asked: 0, questions_correct: 0 }),
      ],
    );

    expect(verdicts.map((v) => v.verdict)).toEqual(['ACHIEVED', 'NOT_ACHIEVED', 'NOT_ACHIEVED']);
  });
});

describe('mapOutcomeResults — title join', () => {
  it('matches despite case, padding, collapsed whitespace and a trailing period', () => {
    const { verdicts, unmatchedOutcomeIds } = mapOutcomeResults(
      [outcome('o1', 'Can  design   RESTful endpoints')],
      [aiResult({ outcome: '  can design restful endpoints.  ' })],
    );

    expect(unmatchedOutcomeIds).toEqual([]);
    expect(verdicts[0]?.outcomeId).toBe('o1');
  });

  it('matches on the Arabic title when the AI used it', () => {
    const { verdicts, unmatchedOutcomeIds } = mapOutcomeResults(
      [outcome('o1', 'Can configure DI containers', 'يمكنه تهيئة حاويات الاعتماد')],
      [aiResult({ outcome: 'يمكنه تهيئة حاويات الاعتماد' })],
    );

    expect(unmatchedOutcomeIds).toEqual([]);
    expect(verdicts[0]?.outcomeId).toBe('o1');
  });

  it('reports an outcome with no matching AI result instead of guessing a score', () => {
    const { verdicts, unmatchedOutcomeIds } = mapOutcomeResults(
      [outcome('o1', 'Matched'), outcome('o2', 'Never mentioned by the AI')],
      [aiResult({ outcome: 'Matched' })],
    );

    expect(verdicts.map((v) => v.outcomeId)).toEqual(['o1']);
    expect(unmatchedOutcomeIds).toEqual(['o2']);
  });

  it('reports AI labels that match none of our outcomes', () => {
    const { unmatchedAiLabels } = mapOutcomeResults(
      [outcome('o1', 'Matched')],
      [aiResult({ outcome: 'Matched' }), aiResult({ outcome: 'Some outcome we never assigned' })],
    );

    expect(unmatchedAiLabels).toEqual(['Some outcome we never assigned']);
  });

  it('does not match two of our outcomes to one AI result by empty title', () => {
    const { verdicts, unmatchedOutcomeIds } = mapOutcomeResults(
      [outcome('o1', '', ''), outcome('o2', '', '')],
      [aiResult({ outcome: '' })],
    );

    expect(verdicts).toEqual([]);
    expect(unmatchedOutcomeIds).toEqual(['o1', 'o2']);
  });

  it('is unaffected by a nonsensical tally, since scoring ignores it', () => {
    const { verdicts } = mapOutcomeResults(
      [outcome('o1', 'Bad tally')],
      [aiResult({ outcome: 'Bad tally', questions_asked: 2, questions_correct: 9, passed: false })],
    );

    expect(verdicts[0]?.score).toBe(0);
  });
});
