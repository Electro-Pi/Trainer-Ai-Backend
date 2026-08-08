export interface OutcomeResponseDto {
  id: string;
  levelId: string;
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
}

export interface UpdateOutcomeDto {
  titleEn?: string;
  titleAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  targetSkills?: string[];
  trainingForm?: 'CONVERSATION' | 'CASE' | 'SIMULATION' | 'ROLEPLAY';
}
