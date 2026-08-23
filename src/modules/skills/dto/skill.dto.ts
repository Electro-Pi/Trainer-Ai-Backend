export interface SkillResponseDto {
  id: string;
  organizationId: string;
  levelId: string | null;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
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
  descriptionEn: string;
  descriptionAr: string;
  levels: string[];
  assessmentEnabled?: boolean;
  levelId?: string;
}

export interface UpdateSkillDto {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  levels?: string[];
  assessmentEnabled?: boolean;
  levelId?: string | null;
}

export interface SkillFilterDto {
  limit?: number;
  cursor?: string;
  isEnabled?: boolean;
}
