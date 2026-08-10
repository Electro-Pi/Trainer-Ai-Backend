import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { RequestHandler, Router } from 'express';

import { queueService } from '@/queue/queue-instance.js';

import { basicAuth } from './basic-auth.guard.js';

const BASE_PATH = '/admin/queues';

/**
 * `P12-4` — BullMQ dashboard for ops visibility into every queue's
 * pending/active/failed jobs. Gated by `basicAuth()`, not the portal-user
 * JWT flow, since this is a browser-navigated page (§4.5 — see the guard's
 * own doc comment for why).
 *
 * `basicAuth` is returned separately from the router rather than
 * `router.use()`-d onto it: `ExpressAdapter.getRouter()` returns bull-board's
 * own internal router with its routes already registered, so any middleware
 * added to it afterward would run AFTER those handlers already responded —
 * a real auth bypass. `app.ts` must mount `basicAuth` on the path BEFORE
 * this router, in the same `app.use(path, basicAuth(), router)` call.
 */
export function createAdminQueuesRouter(): { path: string; auth: RequestHandler; router: Router } {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BASE_PATH);

  createBullBoard({
    queues: queueService.getAllQueues().map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  return { path: BASE_PATH, auth: basicAuth(), router: serverAdapter.getRouter() };
}
