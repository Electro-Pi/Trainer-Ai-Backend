export interface QuestionDto {
  id: string;
  prompt: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  expectedAnswer: string | null;
  modelAnswer: string | null;
  order: number;
}

export interface QuestionBankResponseDto {
  id: string;
  outcomeId: string;
  language: 'EN' | 'AR';
  isActive: boolean;
  questions: QuestionDto[];
}

export interface UpsertQuestionBankDto {
  language: 'EN' | 'AR';
  questions: {
    prompt: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    expectedAnswer?: string;
    modelAnswer?: string;
  }[];
}

export interface CreateQuestionDto {
  questionBankId: string;
  prompt: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  expectedAnswer?: string;
  modelAnswer?: string;
}

export interface UpdateQuestionDto {
  prompt?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  expectedAnswer?: string;
  modelAnswer?: string;
}

export interface RubricCriterionDto {
  id: string;
  label: string;
  description: string;
  weight: number;
  order: number;
}

export interface RubricResponseDto {
  id: string;
  outcomeId: string;
  name: string;
  passThreshold: number;
  isActive: boolean;
  criteria: RubricCriterionDto[];
}

export interface UpsertRubricDto {
  name: string;
  passThreshold: number;
  criteria: {
    label: string;
    description: string;
    weight: number;
  }[];
}
