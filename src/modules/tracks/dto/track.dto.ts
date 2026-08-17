export type TrackIcon = 'Sales' | 'Presentation Skills' | 'Marketing' | 'HR';

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
  icon: string;
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
  icon?: TrackIcon;
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
  icon?: TrackIcon;
}

export interface TrackFilterDto {
  limit?: number;
  cursor?: string;
  isEnabled?: boolean;
}
