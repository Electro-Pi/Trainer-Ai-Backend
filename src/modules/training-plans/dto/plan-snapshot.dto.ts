export interface PlanLearnerOutcomeSnapshotResponseDto {
  status: string;
  attemptCount: number;
  lastScore: number | null;
  achievedAt: string | null;
}

export interface PlanOutcomeSnapshotResponseDto {
  id: string;
  sourceOutcomeId: string | null;
  titleEn: string;
  titleAr: string;
  order: number;
  isRemoved: boolean;
  progress: PlanLearnerOutcomeSnapshotResponseDto | null;
}

export interface PlanSkillSnapshotResponseDto {
  id: string;
  sourceSkillId: string | null;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  levels: string[];
  isRemoved: boolean;
  outcomes: PlanOutcomeSnapshotResponseDto[];
  content: PlanContentSnapshotResponseDto[];
}

export interface PlanContentMediaResponseDto {
  id: string;
  contentSnapshotId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  downloadUrl: string;
  createdAt: string;
}

export interface PlanContentSnapshotResponseDto {
  id: string;
  skillSnapshotId: string | null;
  sourceContentId: string | null;
  title: string;
  contentType: string;
  sourceUrl: string | null;
  textBody: string | null;
  isRemoved: boolean;
  media: PlanContentMediaResponseDto[];
}

export interface PlanTrackSnapshotResponseDto {
  id: string;
  trainingPlanId: string;
  sourceTrackId: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  skills: PlanSkillSnapshotResponseDto[];
  content: PlanContentSnapshotResponseDto[];
}

export interface AddPlanSkillSnapshotDto {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  levels: string[];
}

export interface UpdatePlanSkillSnapshotDto {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  category?: string;
  levels?: string[];
}

export interface AddPlanOutcomeSnapshotDto {
  titleEn: string;
  titleAr: string;
  order: number;
}

export interface UpdatePlanOutcomeSnapshotDto {
  titleEn?: string;
  titleAr?: string;
  order?: number;
}

export interface AddPlanContentSnapshotDto {
  skillSnapshotId?: string;
  title: string;
  contentType: 'DOCUMENT' | 'SLIDES' | 'TEXT' | 'LINK' | 'IMAGE';
  sourceUrl?: string;
  textBody?: string;
}

export interface UpdatePlanContentSnapshotDto {
  title?: string;
  sourceUrl?: string;
  textBody?: string;
}
