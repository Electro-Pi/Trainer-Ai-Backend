import express, { type Express } from 'express';

import { createAdminQueuesRouter } from '@/admin/admin.module.js';
import { NotFoundError } from '@/common/exceptions/app-error.js';
import { errorHandler } from '@/common/filters/error-handler.js';
import { requestIdInterceptor } from '@/common/interceptors/request-id.interceptor.js';
import { compressionMiddleware } from '@/common/middleware/compression.middleware.js';
import { corsMiddleware } from '@/common/middleware/cors.middleware.js';
import { helmetMiddleware } from '@/common/middleware/helmet.middleware.js';
import { localeMiddleware } from '@/common/middleware/locale.middleware.js';
import { rateLimitMiddleware } from '@/common/middleware/rate-limit.middleware.js';
import { container } from '@/config/container.js';
import { runAllHealthChecks } from '@/health/health-checks.js';
import { createHttpLogger, logger } from '@/logger/logger.service.js';
import { agentRouter } from '@/modules/agent/agent.module.js';
import { analyticsRouter } from '@/modules/analytics/analytics.module.js';
import {
  outcomeAssessmentsRouter,
  questionsRouter,
} from '@/modules/assessments/assessments.module.js';
import { authRouter } from '@/modules/auth/auth.module.js';
import { contentRouter, mediaRouter } from '@/modules/content/content.module.js';
import { directoryRouter } from '@/modules/directory/directory.module.js';
import { learnersRouter, teamMembersRouter } from '@/modules/learners/learners.module.js';
import { levelsRouter, trackLevelsRouter } from '@/modules/levels/levels.module.js';
import { levelOutcomesRouter, outcomesRouter } from '@/modules/outcomes/outcomes.module.js';
import { publicRouter } from '@/modules/public/public.module.js';
import {
  learnerRecommendationsRouter,
  recommendationsRouter,
} from '@/modules/recommendations/recommendations.module.js';
import { reportsRouter } from '@/modules/reports/reports.module.js';
import { rsvpWebhookRouter, sessionsRouter } from '@/modules/sessions/sessions.module.js';
import { teamsRouter } from '@/modules/teams/teams.module.js';
import { tracksRouter } from '@/modules/tracks/tracks.module.js';
import { trainingPlansRouter } from '@/modules/training-plans/training-plans.module.js';
import { usersRouter } from '@/modules/users/users.module.js';
import type { ErrorTracker } from '@/shared-types.js';
import { createLocalBlobsRouter } from '@/storage/storage.module.js';
import { mountSwagger } from '@/swagger/swagger.js';

/**
 * Express app assembly only — no `.listen()` here so the app stays
 * importable/testable (P11). Middleware order: request id → http logger →
 * locale → security/perf middleware → routes → swagger → error handler
 * (mounted LAST, per Express 5 error-middleware convention).
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestIdInterceptor());
  app.use(createHttpLogger());
  app.use(localeMiddleware());
  app.use(helmetMiddleware());
  app.use(corsMiddleware());
  app.use(compressionMiddleware());
  app.use(rateLimitMiddleware());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const v1 = express.Router();
  app.use('/api/v1', v1);

  v1.use('/auth', authRouter);
  v1.use('/users', usersRouter);
  v1.use('/directory', directoryRouter);
  v1.use('/teams', teamsRouter);
  v1.use('/teams', teamMembersRouter);
  v1.use('/learners', learnersRouter);
  v1.use('/learners', learnerRecommendationsRouter);
  v1.use('/recommendations', recommendationsRouter);
  v1.use('/tracks', tracksRouter);
  v1.use('/tracks/:trackId/levels', trackLevelsRouter);
  v1.use('/levels', levelsRouter);
  v1.use('/levels/:levelId/outcomes', levelOutcomesRouter);
  v1.use('/outcomes/:id', outcomeAssessmentsRouter);
  v1.use('/outcomes', outcomesRouter);
  v1.use('/questions', questionsRouter);
  v1.use('/content', contentRouter);
  v1.use('/media', mediaRouter);
  v1.use('/local-blobs', createLocalBlobsRouter());
  v1.use('/plans', trainingPlansRouter);
  v1.use('/sessions', sessionsRouter);
  v1.use('/webhooks', rsvpWebhookRouter);
  v1.use('/agent', agentRouter);
  v1.use('/reports', reportsRouter);
  v1.use('/analytics', analyticsRouter);
  v1.use('/public', publicRouter);

  mountSwagger(app);

  const adminQueues = createAdminQueuesRouter();
  app.use(adminQueues.path, adminQueues.auth, adminQueues.router);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    const checks = await runAllHealthChecks();
    const failed = checks.filter((check) => !check.ok);

    if (failed.length > 0) {
      res.status(503).json({ status: 'not_ready', checks });
      return;
    }

    res.status(200).json({ status: 'ready', checks });
  });

  app.use((req, _res, next) => {
    next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
  });

  app.use(errorHandler(logger, container.resolveErrorTracker<ErrorTracker>()));

  return app;
}
