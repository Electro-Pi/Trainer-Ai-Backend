export interface LearnerPerformanceRow {
  learnerId: string;
  displayName: string;
  levelNameEn: string | null;
  levelNameAr: string | null;
  trackNameEn: string | null;
  trackNameAr: string | null;
  sessionsAttended: number;
  sessionsScheduled: number;
  averageScore: number | null;
  outcomesAchieved: number;
  outcomesTotal: number;
  /** Risk/health signal — session attendance and score, not plan lifecycle. */
  status: 'ON_TRACK' | 'AT_RISK' | 'NO_ACTIVITY';
  /** The learner's most recently created `TrainingPlan.status`, or `null` if they have no plan at all. Distinct concept from `status` above. */
  planStatus: 'DRAFT' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | null;
}

export interface TeamPerformanceResponseDto {
  teamId: string;
  learnerCount: number;
  averageScore: number | null;
  outcomeAchievementRate: number | null;
  learners: LearnerPerformanceRow[];
}

export interface OrganizationPerformanceResponseDto {
  teamCount: number;
  learnerCount: number;
  averageScore: number | null;
  outcomeAchievementRate: number | null;
  teams: {
    teamId: string;
    teamName: string;
    learnerCount: number;
    averageScore: number | null;
    outcomeAchievementRate: number | null;
  }[];
  /** Every learner across every team in the org, flattened — lets an ADMIN's
   *  org-wide views (e.g. a team member's profile) resolve a learner's plan
   *  status without knowing in advance which team owns them. */
  learners: LearnerPerformanceRow[];
}

export interface SkillCoverageRow {
  skill: string;
  outcomesTotal: number;
  outcomesAchieved: number;
  coverageRate: number;
}

export interface LearnerSkillsResponseDto {
  learnerId: string;
  displayName: string;
  skills: SkillCoverageRow[];
  recentSessions: {
    sessionId: string;
    scheduledStart: string;
    verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' | null;
    score: number | null;
  }[];
}

export interface TrendPointDto {
  periodStart: string;
  averageScore: number | null;
  sessionsCompleted: number;
  outcomesAchieved: number;
}

export interface TrendsResponseDto {
  granularity: 'week' | 'month';
  points: TrendPointDto[];
}

export interface ContentUsageRow {
  contentItemId: string;
  name: string;
  skillId: string;
  timesDelivered: number;
  timesAchieved: number;
  effectivenessScore: number;
}

export interface ContentUsageResponseDto {
  items: ContentUsageRow[];
}
