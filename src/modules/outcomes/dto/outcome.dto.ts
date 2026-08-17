export interface OutcomeResponseDto {
  id: string;
  levelId: string;
  skillId: string | null;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  targetSkills: string[];
  trainingForm: string;
  order: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOutcomeDto {
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  targetSkills: string[];
  trainingForm: 'CONVERSATION' | 'CASE' | 'SIMULATION' | 'ROLEPLAY';
  skillId?: string;
}

export interface UpdateOutcomeDto {
  titleEn?: string;
  titleAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  targetSkills?: string[];
  trainingForm?: 'CONVERSATION' | 'CASE' | 'SIMULATION' | 'ROLEPLAY';
  skillId?: string;
}
