import { logger } from '@/logger/logger.service.js';

import { DemoRequestRepository } from '../repositories/demo-request.repository.js';

import { modrbLeadForwarderService } from './modrb-lead-forwarder.service.js';

export interface SubmitDemoRequestInput {
  name: string;
  email: string;
  company: string;
  /** Team size picked on the public form; forwarded to the Contact Dashboard. */
  orgSize?: string | undefined;
  phone?: string | undefined;
  message?: string | undefined;
  locale: 'EN' | 'AR';
  /** Honeypot field — real users never populate it. */
  website?: string | undefined;
  /** GDPR — must be `true`, enforced by `demoRequestSchema`. */
  consentGiven: true;
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
      logger.info('demo-request: honeypot tripped, dropping silently');
      return;
    }

    await demoRequestRepository.create({
      name: input.name,
      email: input.email,
      company: input.company,
      phone: input.phone ?? null,
      message: input.message ?? null,
      locale: input.locale,
      consentGivenAt: new Date(),
    } as never);

    // Additive only — MODRB's central dashboard is never allowed to affect
    // this response. `forward()` swallows its own errors and never throws.
    modrbLeadForwarderService
      .forward({
        name: input.name,
        email: input.email,
        companyName: input.company,
        orgSize: input.orgSize,
        phone: input.phone,
        message: input.message,
      })
      .catch((error) => {
        logger.error({ error }, 'modrb-lead-forward: unexpected error escaped forward()');
      });
  }
}

export const publicService = new PublicService();
