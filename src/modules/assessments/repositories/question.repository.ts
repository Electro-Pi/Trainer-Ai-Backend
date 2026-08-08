import type { Question } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Question };

type QuestionDelegate = typeof prisma.question;

export class QuestionRepository extends BaseRepository<Question, QuestionDelegate> {
  constructor() {
    super(prisma.question, 'order');
  }

  async findByQuestionBank(questionBankId: string): Promise<Question[]> {
    return this.delegate.findMany({ where: { questionBankId }, orderBy: { order: 'asc' } });
  }

  async deleteByQuestionBank(questionBankId: string): Promise<void> {
    await prisma.question.deleteMany({ where: { questionBankId } });
  }

  /** `createMany` doesn't return rows in Postgres — caller re-reads via `findByQuestionBank` after this. */
  async createManyForBank(
    questionBankId: string,
    questions: {
      prompt: string;
      difficulty: Question['difficulty'];
      expectedAnswer: string | null;
      modelAnswer: string | null;
      order: number;
    }[],
  ): Promise<void> {
    await prisma.question.createMany({
      data: questions.map((q) => ({ ...q, questionBankId })),
    });
  }
}
