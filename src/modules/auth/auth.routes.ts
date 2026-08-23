import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { strictRateLimitMiddleware } from '@/common/middleware/rate-limit.middleware.js';
import { validate } from '@/common/pipes/validate.js';

import { AuthController } from './controllers/auth.controller.js';
import {
  microsoftCallbackQuerySchema,
  passwordLoginSchema,
  refreshTokenSchema,
  demoLoginSchema,
} from './validators/auth.validators.js';

const controller = new AuthController();

export function createAuthRouter(): Router {
  const router = Router();

  // TEMP: disabled for local dev testing — never commit/push this. router.use(strictRateLimitMiddleware());

  router.get('/microsoft/start', (req, res, next) => {
    controller.microsoftStart(req, res).catch(next);
  });

  router.get(
    '/microsoft/callback',
    validate({ query: microsoftCallbackQuerySchema }),
    (req, res, next) => {
      controller.microsoftCallback(req, res).catch(next);
    },
  );

  router.post('/login', validate({ body: passwordLoginSchema }), (req, res, next) => {
    controller.passwordLogin(req, res).catch(next);
  });

  // Demo-login feature — see `AuthService.signInAsDemoAccount`'s doc comment for the full removal list.
  router.post('/demo-login', validate({ body: demoLoginSchema }), (req, res, next) => {
    controller.demoLogin(req, res).catch(next);
  });

  router.post('/refresh', validate({ body: refreshTokenSchema }), (req, res, next) => {
    controller.refresh(req, res).catch(next);
  });

  router.post('/logout', validate({ body: refreshTokenSchema }), (req, res, next) => {
    controller.logout(req, res).catch(next);
  });

  router.get('/me', authenticate(), tenantScope(), (req, res, next) => {
    controller.me(req, res).catch(next);
  });

  return router;
}
