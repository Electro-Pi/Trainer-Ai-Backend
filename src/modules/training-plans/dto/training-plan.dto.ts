export interface CreateTrainingPlanDto {
  learnerId: string;
  trainingDays: number;
  startDate: string;
  templateId?: string;
}

export interface UpdateTrainingPlanDto {
  title?: string;
  trainingDays?: number;
  startDate?: string;
  endDate?: string;
}

export interface SuggestPlanDto {
  sessionDurationMinutes?: number;
}

export interface SessionSummaryDto {
  id: string;
  sequence: number;
  primaryOutcomeId: string;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  status: string;
  contentItemIds: string[];
}

export interface TrainingPlanResponseDto {
  id: string;
  learnerId: string;
  assignmentId: string;
  title: string;
  trainingDays: number;
  status: string;
  startDate: string;
  endDate: string;
  createdById: string;
  confirmedAt: string | null;
  templateId: string | null;
  sessions: SessionSummaryDto[];
}

export interface CoverageGapDto {
  outcomeId: string;
  outcomeTitleEn: string;
  outcomeTitleAr: string;
}

export interface PlanCoverageDto {
  planId: string;
  requiredOutcomeIds: string[];
  coveredOutcomeIds: string[];
  gaps: CoverageGapDto[];
}

export interface SavePlanTemplateDto {
  name: string;
}

export interface PlanTemplateResponseDto {
  id: string;
  name: string;
  trackId: string;
  levelId: string;
  structure: unknown;
  createdById: string;
}
