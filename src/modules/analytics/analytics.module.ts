import { openApiRegistry } from '@/swagger/swagger.js';

import { createAnalyticsRouter } from './analytics.routes.js';

export const analyticsRouter = createAnalyticsRouter();

openApiRegistry.registerPath({
  method: 'get',
  path: '/analytics/team/{teamId}/performance',
  tags: ['Analytics'],
  summary:
    'Team performance rollup — per-member stats, average score, outcome achievement (`PF-01`, `PF-03`)',
  responses: { 200: { description: 'Team performance' }, 403: { description: 'Not your team' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/analytics/organization/performance',
  tags: ['Analytics'],
  summary: 'Org-wide performance rollup by team, HR/ADMIN read-only (`PF-02`)',
  responses: { 200: { description: 'Organization performance' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/analytics/learners/{id}/skills',
  tags: ['Analytics'],
  summary: 'Skills coverage for one learner, with drill-down session ids (`PF-04`, `PF-05`)',
  responses: { 200: { description: 'Learner skills' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/analytics/trends',
  tags: ['Analytics'],
  summary: 'Score trend over time, filterable by team/track/level/date range (`PF-06`, `PF-09`)',
  responses: { 200: { description: 'Trend points' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/analytics/content-usage',
  tags: ['Analytics'],
  summary: 'Content effectiveness and usage, recomputed nightly (`PF-07`, `RC-13`)',
  responses: { 200: { description: 'Content usage rows' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/analytics/export',
  tags: ['Analytics'],
  summary: 'Exports team or organization performance as PDF or XLSX (`PF-08`)',
  responses: { 200: { description: 'Binary file (PDF or XLSX)' } },
});
