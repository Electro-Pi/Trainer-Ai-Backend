import { Router } from 'express';

import { strictRateLimitMiddleware } from '@/common/middleware/rate-limit.middleware.js';
import { validate } from '@/common/pipes/validate.js';

import { PublicController } from './controllers/public.controller.js';
import { demoRequestSchema, trackKeyParamsSchema } from './validators/public.validators.js';

const controller = new PublicController();

/** 🌐 Fully public — no `authenticate()`/`tenantScope()` anywhere in this router (`WS-01`, `WS-02`). */
export function createPublicRouter(): Router {
  const router = Router();

  router.get('/tracks', (req, res, next) => {
    controller.listTracks(req, res).catch(next);
  });

  router.get('/tracks/:key', validate({ params: trackKeyParamsSchema }), (req, res, next) => {
    controller.getTrack(req, res).catch(next);
  });

  router.post(
    '/demo-requests',
    strictRateLimitMiddleware(),
    validate({ body: demoRequestSchema }),
    (req, res, next) => {
      controller.submitDemoRequest(req, res).catch(next);
    },
  );

  return router;
}
