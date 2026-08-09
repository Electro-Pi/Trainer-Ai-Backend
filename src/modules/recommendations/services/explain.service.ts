import type { Outcome } from '@/modules/outcomes/outcomes.module.js';

import type { ScoredItem } from './scorer.service.js';

export type ReasonCode =
  | 'MANDATORY'
  | 'OUTCOME_CARRIED_OVER'
  | 'REMEDIAL_FOR_WEAK_CRITERION'
  | 'HIGH_EFFECTIVENESS'
  | 'OUTCOME_NOT_ACHIEVED';

export interface Explanation {
  reasonCode: ReasonCode;
  reasonEn: string;
  reasonAr: string;
}

const EFFECTIVENESS_HIGH_THRESHOLD = 0.75;

/**
 * `P6-6` — ARCHITECTURE §8.1 step 6, `RC-05`. Every item gets exactly one
 * `reasonCode`, chosen by the strongest applicable reason in priority order
 * (mandatory > carried-over > weak-criterion remediation > proven
 * effectiveness > default not-achieved), rendered to both languages —
 * `RecommendationItem.reasonEn`/`reasonAr` are stored side by side (D-08),
 * not resolved per-request-locale, since a manager may read one and the
 * learner's report (P9) the other from the same row.
 */
export class ExplainService {
  explain(
    item: ScoredItem,
    outcome: Outcome,
    isMandatory: boolean,
    isCarriedOver: boolean,
  ): Explanation {
    const reasonCode = this.pickReasonCode(item, isMandatory, isCarriedOver);
    return { reasonCode, ...this.render(reasonCode, outcome) };
  }

  private pickReasonCode(
    item: ScoredItem,
    isMandatory: boolean,
    isCarriedOver: boolean,
  ): ReasonCode {
    if (isMandatory) return 'MANDATORY';
    if (isCarriedOver) return 'OUTCOME_CARRIED_OVER';
    if (item.signalBreakdown.gapMatch === 1) return 'REMEDIAL_FOR_WEAK_CRITERION';
    if (item.signalBreakdown.effectiveness >= EFFECTIVENESS_HIGH_THRESHOLD)
      return 'HIGH_EFFECTIVENESS';
    return 'OUTCOME_NOT_ACHIEVED';
  }

  private render(reasonCode: ReasonCode, outcome: Outcome): { reasonEn: string; reasonAr: string } {
    switch (reasonCode) {
      case 'MANDATORY':
        return {
          reasonEn: `Mandatory content for "${outcome.titleEn}".`,
          reasonAr: `محتوى إلزامي لـ "${outcome.titleAr}".`,
        };
      case 'OUTCOME_CARRIED_OVER':
        return {
          reasonEn: `"${outcome.titleEn}" was not achieved in a prior session and carries over.`,
          reasonAr: `لم يتم تحقيق "${outcome.titleAr}" في جلسة سابقة، ويُرحَّل إلى هذه الجلسة.`,
        };
      case 'REMEDIAL_FOR_WEAK_CRITERION':
        return {
          reasonEn: `Targets a weak result the learner had on "${outcome.titleEn}".`,
          reasonAr: `يعالج نتيجة ضعيفة سجّلها المتدرب في "${outcome.titleAr}".`,
        };
      case 'HIGH_EFFECTIVENESS':
        return {
          reasonEn: `Historically effective content for "${outcome.titleEn}".`,
          reasonAr: `محتوى أثبت فعاليته في تحقيق "${outcome.titleAr}".`,
        };
      case 'OUTCOME_NOT_ACHIEVED':
        return {
          reasonEn: `"${outcome.titleEn}" is required and not yet achieved.`,
          reasonAr: `"${outcome.titleAr}" مطلوب ولم يتحقق بعد.`,
        };
    }
  }
}
