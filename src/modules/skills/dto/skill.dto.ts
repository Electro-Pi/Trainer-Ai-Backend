export interface SkillResponseDto {
  id: string;
  organizationId: string;
  key: string;
  nameEn: string;
  nameAr: string;
  category: string;
  descriptionEn: string;
  descriptionAr: string;
  targetTracks: string[];
  levels: string[];
  assessmentEnabled: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillDto {
  key: string;
  nameEn: string;
  nameAr: string;
  category: string;
  descriptionEn: string;
  descriptionAr: string;
  targetTracks: string[];
  levels: string[];
  assessmentEnabled?: boolean;
}

export interface UpdateSkillDto {
  nameEn?: string;
  nameAr?: string;
  category?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  targetTracks?: string[];
  levels?: string[];
  assessmentEnabled?: boolean;
}

export interface SkillFilterDto {
  limit?: number;
  cursor?: string;
  isEnabled?: boolean;
}
