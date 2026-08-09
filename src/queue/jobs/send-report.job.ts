import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import type { ReportRecipient } from '@/modules/agent/services/session-completed-handlers.js';
import {
  renderReportEmailHtml,
  reportEmailSubject,
} from '@/modules/notifications/templates/report-email.template.js';
import { reportRepository } from '@/modules/reports/reports.module.js';
import { trainingPlanRepository } from '@/modules/training-plans/training-plans.module.js';
import type { EmailService, StorageService } from '@/shared-types.js';

import type { QueuePayloads } from '../queues.js';

function isReportRecipientArray(value: unknown): value is ReportRecipient[] {
  return (
    Array.isArray(value) && value.every((r) => typeof r === 'object' && r !== null && 'email' in r)
  );
}

/**
 * `RP-02` — Graph `sendMail` to manager + learner, report language follows
 * each recipient (the report row itself already carries the right language
 * and its own pre-resolved recipient list from `on-session-completed`).
 */
export async function processSendReportJob(payload: QueuePayloads['report.send']): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const report = await reportRepository.findByIdScoped(payload.reportId);
    if (!report) {
      logger.warn({ reportId: payload.reportId }, 'send-report: report not found, skipping');
      return;
    }

    // `RP-06` — `SENT` is a valid starting state here too: `POST
    // /reports/:id/resend` re-enqueues this same job against an
    // already-sent report, and the PDF doesn't need regenerating.
    if (report.status !== 'GENERATED' && report.status !== 'SENT') {
      logger.info(
        { reportId: report.id, status: report.status },
        'send-report: report not generated yet, skipping',
      );
      return;
    }

    if (!report.blobKey) {
      logger.error({ reportId: report.id }, 'send-report: no blobKey, cannot attach PDF');
      return;
    }

    const recipients = isReportRecipientArray(report.recipients) ? report.recipients : [];
    if (recipients.length === 0) {
      logger.warn({ reportId: report.id }, 'send-report: no recipients recorded, skipping');
      return;
    }

    const storage = container.resolveStorage<StorageService>();
    const downloadUrl = await storage.getDownloadUrl(report.blobKey, 3600);
    const pdfResponse = await fetch(downloadUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch generated report PDF: ${pdfResponse.status}`);
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    const plan = report.planId ? await trainingPlanRepository.findByIdScoped(report.planId) : null;
    const emailService = container.resolveEmail<EmailService>();

    for (const recipient of recipients) {
      const senderPortalUserId =
        recipient.role === 'MANAGER' ? recipient.portalUserId : plan?.createdById;

      await emailService.send({
        to: recipient.email,
        subject: reportEmailSubject(report.language),
        html: renderReportEmailHtml(recipient.name, report.language),
        attachments: [
          {
            filename: `report-${report.id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
        ...(senderPortalUserId ? { senderPortalUserId } : {}),
      });
    }

    await reportRepository.markSent(report.id, recipients);

    await writeAuditLog({
      organizationId: payload.organizationId,
      actorType: 'SYSTEM',
      action: 'report.sent',
      entityType: 'Report',
      entityId: report.id,
      after: { recipientCount: recipients.length },
    });

    logger.info({ reportId: report.id, recipientCount: recipients.length }, 'Report sent');
  });
}
