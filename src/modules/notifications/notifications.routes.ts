import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { NotificationController } from './controllers/notification.controller.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} from './validators/notification.validators.js';

const controller = new NotificationController();

/** Every route here is self-service — the caller only ever reads/writes their own notifications, no role gating beyond being an authenticated portal user. */
export function createNotificationsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/', validate({ query: listNotificationsQuerySchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.patch('/:id/read', validate({ params: notificationIdParamsSchema }), (req, res, next) => {
    controller.markRead(req, res).catch(next);
  });

  router.patch('/read-all', (req, res, next) => {
    controller.markAllRead(req, res).catch(next);
  });

  router.delete('/:id', validate({ params: notificationIdParamsSchema }), (req, res, next) => {
    controller.delete(req, res).catch(next);
  });

  return router;
}
