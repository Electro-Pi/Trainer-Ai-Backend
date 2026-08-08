import type { Language, QuestionBank } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { QuestionBank };

type QuestionBankDelegate = typeof prisma.questionBank;

export class QuestionBankRepository extends BaseRepository<QuestionBank, QuestionBankDelegate> {
  constructor() {
    super(prisma.questionBank, 'createdAt');
  }

  async findByOutcomeAndLanguage(
    outcomeId: string,
    language: Language,
  ): Promise<QuestionBank | null> {
    return this.delegate.findFirst({ where: { outcomeId, language } });
  }
}
