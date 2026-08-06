export interface LearnerResponseDto {
  id: string;
  organizationId: string;
  teamId: string;
  entraObjectId: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  preferredLanguage: string;
  status: string;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface ImportLearnerDto {
  entraObjectId: string;
  email: string;
  displayName: string;
  jobTitle?: string;
  department?: string;
  preferredLanguage?: 'EN' | 'AR';
}

export interface ImportLearnersDto {
  learners: ImportLearnerDto[];
}

export interface UpdateLearnerDto {
  jobTitle?: string;
  department?: string;
  preferredLanguage?: 'EN' | 'AR';
}

export interface LearnerFilterDto {
  limit?: number;
  cursor?: string;
  teamId?: string;
}

export interface LearnerExperienceResponseDto {
  id: string;
  learnerId: string;
  background: string;
  yearsOfExperience: number;
  priorTraining: string | null;
  notes: string | null;
  recordedById: string;
  createdAt: string;
}

export interface PutLearnerExperienceDto {
  background: string;
  yearsOfExperience: number;
  priorTraining?: string;
  notes?: string;
}

export interface LearnerOutcomeResponseDto {
  id: string;
  learnerId: string;
  outcomeId: string;
  assignmentId: string;
  status: string;
  priority: number;
  isCustom: boolean;
  attemptCount: number;
  lastScore: number | null;
  achievedAt: string | null;
}

export interface PatchLearnerOutcomesDto {
  add?: string[];
  remove?: string[];
  reprioritize?: { outcomeId: string; priority: number }[];
}

export interface AssignLearnerDto {
  trackId: string;
  levelId: string;
}

export interface LearnerAssignmentResponseDto {
  id: string;
  learnerId: string;
  trackId: string;
  levelId: string;
  assignedById: string;
  assignedAt: string;
  completedAt: string | null;
  isActive: boolean;
}
