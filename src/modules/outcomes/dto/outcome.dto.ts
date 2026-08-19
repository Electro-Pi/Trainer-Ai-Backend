export interface OutcomeResponseDto {
  id: string;
  levelId: string;
  skillId: string | null;
  titleEn: string;
  titleAr: string;
  targetSkills: string[];
  order: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOutcomeDto {
  titleEn: string;
  titleAr: string;
  targetSkills: string[];
  skillId?: string;
}

export interface UpdateOutcomeDto {
  titleEn?: string;
  titleAr?: string;
  targetSkills?: string[];
  skillId?: string;
}
