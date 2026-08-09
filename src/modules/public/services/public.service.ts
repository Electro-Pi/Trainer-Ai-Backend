import { logger } from '@/logger/logger.service.js';

import { DemoRequestRepository } from '../repositories/demo-request.repository.js';

export interface SubmitDemoRequestInput {
  name: string;
  email: string;
  company: string;
  phone?: string | undefined;
  message?: string | undefined;
  locale: 'EN' | 'AR';
  /** Honeypot field — real users never populate it. */
  website?: string | undefined;
}

const demoRequestRepository = new DemoRequestRepository();

export class PublicService {
  /**
   * `WS-01` — the only unauthenticated write in the system. A filled
   * honeypot is treated as a successful submission from the caller's point
   * of view (no error, no distinguishing response) but is never persisted —
   * revealing detection just teaches the bot to leave the field blank.
   */
  async submitDemoRequest(input: SubmitDemoRequestInput): Promise<void> {
    if (input.website) {
      logger.info({ email: input.email }, 'demo-request: honeypot tripped, dropping silently');
      return;
    }

    await demoRequestRepository.create({
      name: input.name,
      email: input.email,
      company: input.company,
      phone: input.phone ?? null,
      message: input.message ?? null,
      locale: input.locale,
    } as never);
  }
}

export const publicService = new PublicService();
