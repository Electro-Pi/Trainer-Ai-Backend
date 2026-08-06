import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';

/**
 * Skeleton — real JWT verification lands in Phase 2. Signature is final so
 * app.ts / route tables written now don't need to change when P2 lands.
 */
export function authenticate() {
  return (_req: Request, _res: Response, _next: NextFunction): void => {
    throw new UnauthorizedError('Not implemented until Phase 2');
  };
}
