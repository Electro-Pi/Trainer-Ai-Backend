import nodemailer, { type Transporter } from 'nodemailer';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import type { EmailService, SendMailInput } from '@/shared-types.js';

/** `RP-02` SMTP fallback — used when `EMAIL_PROVIDER=smtp` or Graph delivery fails. */
export class SmtpEmailService implements EmailService {
  private transporter: Transporter | undefined;

  private getTransporter(): Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    return this.transporter;
  }

  async send(input: SendMailInput): Promise<void> {
    try {
      await this.getTransporter().sendMail({
        from: env.SMTP_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      });
    } catch (error) {
      throw new ExternalServiceError(
        `SMTP send failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
