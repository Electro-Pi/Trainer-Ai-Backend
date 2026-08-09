export interface RecommendationItemResult {
  id: string;
  contentItemId: string;
  outcomeId: string;
  rank: number;
  score: number;
  reasonCode: string;
  reasonEn: string;
  reasonAr: string;
  signalBreakdown: Record<string, number>;
  status: string;
}

export interface CoverageGapDto {
  outcomeId: string;
  outcomeTitleEn: string;
  outcomeTitleAr: string;
}

export interface RecommendationResponseDto {
  id: string;
  learnerId: string;
  assignmentId: string;
  sessionId: string | null;
  trigger: string;
  status: string;
  generatedAt: string;
  confirmedAt: string | null;
  confirmedById: string | null;
  items: RecommendationItemResult[];
  coverageGaps: CoverageGapDto[];
}

export interface RecommendationItemActionDto {
  action: 'ACCEPT' | 'REJECT' | 'REORDER' | 'REPLACE';
  /** Required when `action` is `REORDER`. */
  rank?: number;
  /** Required when `action` is `REPLACE`. */
  replacementContentItemId?: string;
}

export interface ConfirmRecommendationDto {
  itemActions?: { itemId: string; action: RecommendationItemActionDto }[];
}
