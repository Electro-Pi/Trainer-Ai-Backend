import { AssessmentAnswerRepository } from './repositories/assessment-answer.repository.js';
import { AssessmentRepository } from './repositories/assessment.repository.js';
import { QuestionBankRepository } from './repositories/question-bank.repository.js';
import { QuestionRepository } from './repositories/question.repository.js';
import { RubricCriterionRepository } from './repositories/rubric-criterion.repository.js';
import { RubricRepository } from './repositories/rubric.repository.js';

export type { Assessment } from './repositories/assessment.repository.js';
export type { QuestionBank } from './repositories/question-bank.repository.js';
export type { Question } from './repositories/question.repository.js';
export type { Rubric } from './repositories/rubric.repository.js';
export type { RubricCriterion } from './repositories/rubric-criterion.repository.js';

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `agent` (P8)
// reads question banks/rubrics for session context and writes
// assessments/answers on completion through these instead of deep-importing
// `modules/assessments/repositories/*`.
export const assessmentRepository = new AssessmentRepository();
export const assessmentAnswerRepository = new AssessmentAnswerRepository();
export const questionBankRepository = new QuestionBankRepository();
export const questionRepository = new QuestionRepository();
export const rubricRepository = new RubricRepository();
export const rubricCriterionRepository = new RubricCriterionRepository();
