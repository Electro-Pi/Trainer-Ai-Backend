import type { z } from 'zod';

import type {
  remediationRequestSchema,
  submitAnswerSchema,
  submitNotesSchema,
  submitTranscriptSchema,
} from '../validators/agent.validators.js';

export type SubmitAnswerDto = z.infer<typeof submitAnswerSchema>;
export type SubmitNotesDto = z.infer<typeof submitNotesSchema>;
export type SubmitTranscriptDto = z.infer<typeof submitTranscriptSchema>;
export type RemediationRequestDto = z.infer<typeof remediationRequestSchema>;

// `P8-3` — the payload contract that makes `LS-02`/`LS-03`/`LS-04`/`CM-06`
// possible on the AI team's side (ARCHITECTURE §9.11). Shaped field-by-field
// per the spec, not as a generic "session dump".

export interface SessionContextOutcome {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  targetSkills: string[];
  isCarriedOver: boolean;
  priority: number;
}

export interface SessionContextMedia {
  id: string;
  mimeType: string;
  url: string;
  pageCount: number | null;
  caption: string | null;
  altTextEn: string | null;
  altTextAr: string | null;
}

export interface SessionContextContentItem {
  sessionContentId: string;
  contentItemId: string;
  order: number;
  title: string;
  contentType: string;
  textBody: string | null;
  sourceUrl: string | null;
  source: string;
  deliveredAt: string | null;
  media: SessionContextMedia[];
}

export interface SessionContextQuestion {
  id: string;
  outcomeId: string;
  prompt: string;
  difficulty: string;
  expectedAnswer: string | null;
  modelAnswer: string | null;
}

export interface SessionContextRubricCriterion {
  id: string;
  label: string;
  description: string;
  weight: number;
}

export interface SessionContextRubric {
  id: string;
  name: string;
  passThreshold: number;
  criteria: SessionContextRubricCriterion[];
}

export interface SessionContextResponse {
  sessionId: string;
  status: string;
  language: 'EN' | 'AR';
  learner: {
    id: string;
    displayName: string;
    jobTitle: string | null;
    departmentId: string | null;
  };
  level: {
    id: string;
    nameEn: string;
    nameAr: string;
  };
  outcomes: SessionContextOutcome[];
  content: SessionContextContentItem[];
  questions: SessionContextQuestion[];
  rubric: SessionContextRubric | null;
}
