import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { reportRepository } from '@/modules/reports/reports.module.js';
import { pdfRendererService } from '@/modules/reports/services/pdf-renderer.service.js';
import { planSummaryDataService } from '@/modules/reports/services/plan-summary-data.service.js';
import { reportDataService } from '@/modules/reports/services/report-data.service.js';
import { renderPlanSummaryReportHtml } from '@/modules/reports/templates/plan-summary-report.template.js';
import { renderSessionReportHtml } from '@/modules/reports/templates/session-report.template.js';
import type { StorageService } from '@/shared-types.js';

import { queueService } from '../queue-instance.js';
import type { QueuePayloads } from '../queues.js';

/**
 * `RP-01` — renders the report's PDF and stores it. Report language follows
 * each **recipient**, not the report's own `language` column in isolation —
 * `on-session-completed.handler.ts` (P8-8b) creates one `Report` row per
 * distinct recipient language (manager, learner) so this job only ever
 * renders the single language its own row carries. `PLAN_SUMMARY` (`RP-05`)
 * reads across every session in the plan instead of one.
 */
export async function processGenerateReportJob(
  payload: QueuePayloads['report.generate'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const report = await reportRepository.findByIdScoped(payload.reportId);
    if (!report) {
      logger.warn({ reportId: payload.reportId }, 'generate-report: report not found, skipping');
      return;
    }

    if (report.status !== 'PENDING') {
      logger.info(
        { reportId: report.id, status: report.status },
        'generate-report: already generated, skipping',
      );
      return;
    }

    try {
      const html = await renderReportHtml(report);

      const pdf = await pdfRendererService.renderPdf(html);

      const blobKey = `reports/${payload.organizationId}/${report.id}.pdf`;
      const storage = container.resolveStorage<StorageService>();
      await storage.upload(blobKey, pdf, 'application/pdf');

      await reportRepository.markGenerated(report.id, blobKey);

      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'report.generated',
        entityType: 'Report',
        entityId: report.id,
        after: { blobKey, language: report.language },
      });

      await queueService.enqueue('report.send', {
        reportId: report.id,
        organizationId: payload.organizationId,
      });

      logger.info({ reportId: report.id }, 'Report generated');
    } catch (error) {
      logger.error({ reportId: report.id, err: error }, 'generate-report: rendering failed');
      await reportRepository.markFailed(
        report.id,
        error instanceof Error ? error.message : 'unknown error',
      );
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'report.generation_failed',
        entityType: 'Report',
        entityId: report.id,
        after: { reason: error instanceof Error ? error.message : 'unknown' },
      });
    }
  });
}

async function renderReportHtml(report: {
  type: string;
  sessionId: string | null;
  planId: string | null;
  language: 'EN' | 'AR';
  recipients: unknown;
}): Promise<string> {
  if (report.type === 'SESSION') {
    if (!report.sessionId) throw new Error('SESSION report missing sessionId');
    // `session-completed-handlers.ts` creates one SESSION report per
    // recipient (never mixed) — `recipients[0].role` is always present.
    const recipients = report.recipients as { role: 'LEARNER' | 'DEPARTMENT_MANAGER' }[];
    const recipientRole = recipients[0]?.role;
    if (!recipientRole) throw new Error('SESSION report missing a recipient role');
    const data = await reportDataService.buildSessionReport(report.sessionId, recipientRole);
    return renderSessionReportHtml(data, report.language, recipientRole);
  }

  if (report.type === 'PLAN_SUMMARY') {
    if (!report.planId) throw new Error('PLAN_SUMMARY report missing planId');
    const data = await planSummaryDataService.buildPlanSummary(report.planId);
    return renderPlanSummaryReportHtml(data, report.language);
  }

  throw new Error(`Unsupported report type: ${report.type}`);
}
