import { ReportRepository } from './repositories/report.repository.js';

export type { Report } from './repositories/report.repository.js';

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `agent`
// (P8-8b) creates the `Report` row and enqueues `report.generate` on
// `session.completed`; P9 builds the router/service/renderer that actually
// consumes it. No router exported yet — that's P9's job.
export const reportRepository = new ReportRepository();
