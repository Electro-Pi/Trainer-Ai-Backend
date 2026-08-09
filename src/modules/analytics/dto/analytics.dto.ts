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
  status: 'ON_TRACK' | 'AT_RISK' | 'NO_ACTIVITY';
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
  title: string;
  contentType: string;
  trackId: string;
  levelId: string;
  timesDelivered: number;
  timesAchieved: number;
  effectivenessScore: number;
}

export interface ContentUsageResponseDto {
  items: ContentUsageRow[];
}
