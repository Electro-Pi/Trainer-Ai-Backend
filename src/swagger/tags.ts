// Fixed display order (ARCHITECTURE §9.0). Each module registers its own
// tag via its `<name>.module.ts`; this file only fixes the grouping order
// so a 100+ endpoint spec stays navigable instead of being one flat page.

export interface SwaggerTag {
  name: string;
  description: string;
}

export const SWAGGER_TAGS: SwaggerTag[] = [
  {
    name: 'Authentication',
    description: 'Entra ID OAuth, email/password fallback, JWT session lifecycle',
  },
  { name: 'Users', description: 'Portal user CRUD and role management' },
  { name: 'Organizations', description: 'Tenant configuration and branding' },
  { name: 'Teams', description: 'Team creation and membership' },
  { name: 'Learners', description: 'Learner records, experience capture, level assignment' },
  { name: 'Tracks', description: 'Training track catalogue' },
  { name: 'Levels', description: 'Levels within a track' },
  { name: 'Outcomes', description: 'Outcomes within a level, and per-learner tracking' },
  { name: 'Content', description: 'Content items, media, review lifecycle, coverage' },
  { name: 'Assessments', description: 'Question banks and scoring rubrics' },
  { name: 'Recommendations', description: 'The deterministic recommendation engine' },
  { name: 'Training Plans', description: 'Training day and session planning' },
  { name: 'Sessions', description: 'Session scheduling, invitations, transcripts' },
  { name: 'Agent API', description: 'Service-token endpoints consumed by the external AI agent' },
  { name: 'Reports', description: 'PDF report generation and delivery' },
  { name: 'Notifications', description: 'Email dispatch and reminders' },
  { name: 'Analytics', description: 'Performance and skills analytics' },
  { name: 'Public', description: 'Unauthenticated public website endpoints' },
  { name: 'Health', description: 'Liveness and readiness checks' },
];
