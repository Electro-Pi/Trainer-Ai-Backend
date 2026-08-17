import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { AssessmentController } from './controllers/assessment.controller.js';
import {
  createQuestionSchema,
  outcomeIdParamsSchema,
  questionIdParamsSchema,
  updateQuestionSchema,
  upsertQuestionBankSchema,
  upsertRubricSchema,
} from './validators/assessment.validators.js';

const controller = new AssessmentController();
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'CONTENT_CREATOR', 'ADMIN'] as const;

/** Nested under `/outcomes/:id/...` — any signed-in portal role reads, MANAGER/CONTENT_MANAGER/ADMIN write (§7.2). */
export function createOutcomeAssessmentsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.use(authenticate(), tenantScope());

  router.get(
    '/question-bank',
    validate({
      params: outcomeIdParamsSchema,
      query: upsertQuestionBankSchema.pick({ language: true }),
    }),
    (req, res, next) => {
      controller.getQuestionBank(req, res).catch(next);
    },
  );

  router.put(
    '/question-bank',
    authorize(...WRITE_ROLES),
    validate({ params: outcomeIdParamsSchema, body: upsertQuestionBankSchema }),
    (req, res, next) => {
      controller.upsertQuestionBank(req, res).catch(next);
    },
  );

  router.get('/rubric', validate({ params: outcomeIdParamsSchema }), (req, res, next) => {
    controller.getRubric(req, res).catch(next);
  });

  router.put(
    '/rubric',
    authorize(...WRITE_ROLES),
    validate({ params: outcomeIdParamsSchema, body: upsertRubricSchema }),
    (req, res, next) => {
      controller.upsertRubric(req, res).catch(next);
    },
  );

  return router;
}

/** Flat `/questions/:id` — individual question CRUD outside the whole-bank replace flow. */
export function createQuestionsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.post(
    '/',
    authorize(...WRITE_ROLES),
    validate({ body: createQuestionSchema }),
    (req, res, next) => {
      controller.createQuestion(req, res).catch(next);
    },
  );

  router.patch(
    '/:id',
    authorize(...WRITE_ROLES),
    validate({ params: questionIdParamsSchema, body: updateQuestionSchema }),
    (req, res, next) => {
      controller.updateQuestion(req, res).catch(next);
    },
  );

  router.delete(
    '/:id',
    authorize(...WRITE_ROLES),
    validate({ params: questionIdParamsSchema }),
    (req, res, next) => {
      controller.deleteQuestion(req, res).catch(next);
    },
  );

  return router;
}
