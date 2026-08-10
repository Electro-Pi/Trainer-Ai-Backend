import express, { type RequestHandler, type Router } from 'express';

import { queueService } from '@/queue/queue-instance.js';
import { QUEUE_NAMES } from '@/queue/queues.js';

import { basicAuth } from './basic-auth.guard.js';

const BASE_PATH = '/admin/queues';

/**
 * `P12-4` — queue depth snapshot for ops visibility into every queue's
 * ready/active/failed jobs. pg-boss has no Express-mountable dashboard
 * (bull-board's `BullMQAdapter` had no pg-boss equivalent) — its own
 * `pg-boss-dashboard` package runs as a separate standalone process against
 * `DATABASE_URL` instead, so operators wanting a full UI run that alongside
 * this API rather than mounted inside it. This JSON endpoint covers the
 * at-a-glance check bull-board's queue list gave us.
 *
 * Gated by `basicAuth()`, not the portal-user JWT flow, since this is a
 * browser-navigated page (§4.5 — see the guard's own doc comment for why).
 */
export function createAdminQueuesRouter(): { path: string; auth: RequestHandler; router: Router } {
  const router = express.Router();

  router.get('/', (_req, res, next) => {
    queueService
      .ensureAllQueues()
      .then(() =>
        Promise.all(
          QUEUE_NAMES.map(async (name) => {
            const [stats] = await queueService.getBoss().getQueueStats(name);
            return {
              name,
              size: stats?.totalCount ?? 0,
              ready: stats?.readyCount ?? 0,
              active: stats?.activeCount ?? 0,
              failed: stats?.failedCount ?? 0,
            };
          }),
        ),
      )
      .then((queues) => res.status(200).json({ queues }))
      .catch(next);
  });

  return { path: BASE_PATH, auth: basicAuth(), router };
}
