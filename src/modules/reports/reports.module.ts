import { openApiRegistry } from '@/swagger/swagger.js';

import { createReportsRouter } from './reports.routes.js';
import { ReportRepository, type ReportListFilters } from './repositories/report.repository.js';

export type { Report } from './repositories/report.repository.js';
export type { ReportListFilters };
export type { PlanSummaryRecipient } from './services/report.service.js';
export { createPlanSummaryReports } from './services/report.service.js';

export const reportsRouter = createReportsRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `agent`
// (P8-8b) creates `Report` rows and enqueues `report.generate` on
// `session.completed`; the `report.generate`/`report.send` jobs (P9) read
// and update them; this router exposes list/download/resend to portal users;
// `createPlanSummaryReports` is `training-plans`' entry point for `RP-05`.
export const reportRepository = new ReportRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/reports',
  tags: ['Reports'],
  summary: 'Lists reports, filterable by session/plan/status',
  responses: { 200: { description: 'Report list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/reports/{id}',
  tags: ['Reports'],
  summary: 'Gets a report and a time-limited download URL for its PDF (`RP-06`)',
  responses: { 200: { description: 'Report' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/reports/{id}/resend',
  tags: ['Reports'],
  summary: 'Re-sends a previously generated report to its recipients (`RP-06`)',
  responses: { 200: { description: 'Report' } },
});
