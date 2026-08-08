export interface LevelResponseDto {
  id: string;
  trackId: string;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  order: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLevelDto {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export interface UpdateLevelDto {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
}
