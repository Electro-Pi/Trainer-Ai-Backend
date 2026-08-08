import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';

import type {
  CreateQuestionDto,
  UpdateQuestionDto,
  UpsertQuestionBankDto,
  UpsertRubricDto,
} from '../dto/assessment.dto.js';
import type { QuestionBank } from '../repositories/question-bank.repository.js';
import { QuestionBankRepository } from '../repositories/question-bank.repository.js';
import type { Question } from '../repositories/question.repository.js';
import { QuestionRepository } from '../repositories/question.repository.js';
import type { RubricCriterion } from '../repositories/rubric-criterion.repository.js';
import { RubricCriterionRepository } from '../repositories/rubric-criterion.repository.js';
import type { Rubric } from '../repositories/rubric.repository.js';
import { RubricRepository } from '../repositories/rubric.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

export interface QuestionBankWithQuestions {
  bank: QuestionBank;
  questions: Question[];
}

export interface RubricWithCriteria {
  rubric: Rubric;
  criteria: RubricCriterion[];
}

/** `assessments` module — P5-12: question bank per outcome (`CM-10`), rubric with weighted criteria (`CM-11`). */
export class AssessmentService {
  private readonly questionBanks = new QuestionBankRepository();
  private readonly questions = new QuestionRepository();
  private readonly rubrics = new RubricRepository();
  private readonly criteria = new RubricCriterionRepository();

  private async requireOutcome(outcomeId: string) {
    const outcome = await outcomeRepository.findByIdScoped(outcomeId);
    if (!outcome) {
      throw new NotFoundError('Outcome not found');
    }
    return outcome;
  }

  async getQuestionBank(
    outcomeId: string,
    language: 'EN' | 'AR',
  ): Promise<QuestionBankWithQuestions> {
    await this.requireOutcome(outcomeId);
    const bank = await this.questionBanks.findByOutcomeAndLanguage(outcomeId, language);
    if (!bank) {
      throw new NotFoundError('No question bank for this outcome/language');
    }
    const questions = await this.questions.findByQuestionBank(bank.id);
    return { bank, questions };
  }

  /**
   * `CM-10` — `PUT` semantics: get-or-create the bank for `(outcomeId, language)`,
   * then replace its whole question set. Simpler and safer than diffing an
   * arbitrary reorder/add/remove for a content-manager-facing bulk editor.
   */
  async upsertQuestionBank(
    actor: ActingUser,
    outcomeId: string,
    dto: UpsertQuestionBankDto,
  ): Promise<QuestionBankWithQuestions> {
    await this.requireOutcome(outcomeId);

    let bank = await this.questionBanks.findByOutcomeAndLanguage(outcomeId, dto.language);
    if (!bank) {
      bank = await this.questionBanks.create({
        outcomeId,
        language: dto.language,
      } as never);
    }

    await this.questions.deleteByQuestionBank(bank.id);
    await this.questions.createManyForBank(
      bank.id,
      dto.questions.map((q, index) => ({
        prompt: q.prompt,
        difficulty: q.difficulty,
        expectedAnswer: q.expectedAnswer ?? null,
        modelAnswer: q.modelAnswer ?? null,
        order: index,
      })),
    );
    const created = await this.questions.findByQuestionBank(bank.id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'assessments.questionBankReplaced',
      entityType: 'QuestionBank',
      entityId: bank.id,
      after: { outcomeId, language: dto.language, questionCount: created.length },
    });

    return { bank, questions: created };
  }

  async updateQuestion(actor: ActingUser, id: string, dto: UpdateQuestionDto): Promise<Question> {
    const before = await this.questions.findById(id);
    if (!before) {
      throw new NotFoundError('Question not found');
    }

    const updated = await this.questions.update(id, {
      ...(dto.prompt !== undefined ? { prompt: dto.prompt } : {}),
      ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
      ...(dto.expectedAnswer !== undefined ? { expectedAnswer: dto.expectedAnswer } : {}),
      ...(dto.modelAnswer !== undefined ? { modelAnswer: dto.modelAnswer } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'assessments.questionUpdated',
      entityType: 'Question',
      entityId: id,
      before: { prompt: before.prompt },
      after: { prompt: updated.prompt },
    });

    return updated;
  }

  async createQuestion(actor: ActingUser, dto: CreateQuestionDto): Promise<Question> {
    const bank = await this.questionBanks.findById(dto.questionBankId);
    if (!bank) {
      throw new ValidationError([
        { path: 'questionBankId', code: 'invalid', message: 'Question bank not found' },
      ]);
    }

    const siblings = await this.questions.findByQuestionBank(dto.questionBankId);
    const created = await this.questions.create({
      questionBankId: dto.questionBankId,
      prompt: dto.prompt,
      difficulty: dto.difficulty,
      expectedAnswer: dto.expectedAnswer ?? null,
      modelAnswer: dto.modelAnswer ?? null,
      order: siblings.length,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'assessments.questionCreated',
      entityType: 'Question',
      entityId: created.id,
      after: { questionBankId: dto.questionBankId },
    });

    return created;
  }

  async deleteQuestion(actor: ActingUser, id: string): Promise<void> {
    const before = await this.questions.findById(id);
    if (!before) {
      throw new NotFoundError('Question not found');
    }
    await this.questions.delete(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'assessments.questionDeleted',
      entityType: 'Question',
      entityId: id,
      before: { prompt: before.prompt },
    });
  }

  async getRubric(outcomeId: string): Promise<RubricWithCriteria> {
    await this.requireOutcome(outcomeId);
    const rubric = await this.rubrics.findActiveByOutcome(outcomeId);
    if (!rubric) {
      throw new NotFoundError('No active rubric for this outcome');
    }
    const criteria = await this.criteria.findByRubric(rubric.id);
    return { rubric, criteria };
  }

  /**
   * `CM-11` — `PUT` semantics: get-or-create the active rubric for this
   * outcome, then replace its whole criteria set. Weight-sums-to-100 is
   * already enforced at the validator layer; re-checking here is redundant
   * with the same schema every mutating endpoint re-validates against
   * (AGENTS rule 4).
   */
  async upsertRubric(
    actor: ActingUser,
    outcomeId: string,
    dto: UpsertRubricDto,
  ): Promise<RubricWithCriteria> {
    await this.requireOutcome(outcomeId);

    let rubric = await this.rubrics.findActiveByOutcome(outcomeId);
    if (!rubric) {
      rubric = await this.rubrics.create({
        outcomeId,
        name: dto.name,
        passThreshold: dto.passThreshold,
      } as never);
    } else {
      rubric = await this.rubrics.update(rubric.id, {
        name: dto.name,
        passThreshold: dto.passThreshold,
      } as never);
    }

    await this.criteria.deleteByRubric(rubric.id);
    await this.criteria.createManyForRubric(
      rubric.id,
      dto.criteria.map((c, index) => ({
        label: c.label,
        description: c.description,
        weight: c.weight,
        order: index,
      })),
    );
    const created = await this.criteria.findByRubric(rubric.id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'assessments.rubricReplaced',
      entityType: 'Rubric',
      entityId: rubric.id,
      after: { outcomeId, criteriaCount: created.length, passThreshold: dto.passThreshold },
    });

    return { rubric, criteria: created };
  }
}
