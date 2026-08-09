import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { graphMailService } from '@/integrations/microsoft/graph.mail.js';
import type { EmailService, SendMailInput } from '@/shared-types.js';

/** `RP-02` primary — Graph `sendMail` on behalf of the report's sending manager. */
export class GraphEmailService implements EmailService {
  async send(input: SendMailInput): Promise<void> {
    if (!input.senderPortalUserId) {
      throw new ExternalServiceError('GraphEmailService requires senderPortalUserId');
    }

    await graphMailService.sendMail(input.senderPortalUserId, {
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.attachments
        ? {
            attachments: input.attachments.map((attachment) => ({
              filename: attachment.filename,
              contentType: attachment.contentType,
              contentBytes: attachment.content.toString('base64'),
            })),
          }
        : {}),
    });
  }
}
