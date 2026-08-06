import type { Question } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type QuestionDelegate = typeof prisma.question;

export class QuestionRepository extends BaseRepository<Question, QuestionDelegate> {
  constructor() {
    super(prisma.question, 'order');
  }

  async findByQuestionBank(questionBankId: string): Promise<Question[]> {
    return this.delegate.findMany({ where: { questionBankId }, orderBy: { order: 'asc' } });
  }
}
