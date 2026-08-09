import { logger } from '@/logger/logger.service.js';
import type { EmailService, SendMailInput } from '@/shared-types.js';

/** Dev/test default (ARCHITECTURE §4.5) — logs instead of sending, never real mail from dev. */
export class FakeEmailService implements EmailService {
  async send(input: SendMailInput): Promise<void> {
    logger.info(
      { to: input.to, subject: input.subject, attachments: input.attachments?.length ?? 0 },
      'FakeEmailService.send — no real mail sent',
    );
    return Promise.resolve();
  }
}
