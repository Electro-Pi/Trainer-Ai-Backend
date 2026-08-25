export interface TrackResponseDto {
  id: string;
  organizationId: string;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  departmentId: string;
  departmentName: string;
  targetSkills: string[];
  trainingForm: string;
  impactIndicators: string[];
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTrackDto {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  departmentId: string;
  targetSkills: string[];
  trainingForm: 'CONVERSATION' | 'CASE' | 'SIMULATION' | 'ROLEPLAY';
  impactIndicators: string[];
}

export interface UpdateTrackDto {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  departmentId?: string;
  targetSkills?: string[];
  trainingForm?: 'CONVERSATION' | 'CASE' | 'SIMULATION' | 'ROLEPLAY';
  impactIndicators?: string[];
}

export interface TrackFilterDto {
  limit?: number;
  cursor?: string;
  isEnabled?: boolean;
}

export type LevelKey = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface CreateFullContentDto {
  name: string;
}

export interface CreateFullOutcomeDto {
  titleEn: string;
  titleAr: string;
}

export interface CreateFullSkillDto {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  assessmentEnabled?: boolean;
  outcomes: CreateFullOutcomeDto[];
  content: CreateFullContentDto[];
}

export interface CreateFullLevelDto {
  key: LevelKey;
  skills: CreateFullSkillDto[];
}

export interface CreateFullTrackDto {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  departmentId: string;
  levels: CreateFullLevelDto[];
}

export interface FullTrackResponseDto {
  track: TrackResponseDto;
  levels: {
    id: string;
    key: LevelKey;
    nameEn: string;
    nameAr: string;
    order: number;
    skills: {
      id: string;
      nameEn: string;
      nameAr: string;
      outcomes: { id: string; titleEn: string; titleAr: string }[];
      content: { id: string; name: string }[];
    }[];
  }[];
}
