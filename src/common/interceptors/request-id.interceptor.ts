import { createId } from '@paralleldrive/cuid2';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * The single source of truth for request IDs — pino-http (P0-7) reads
 * `req.requestId` for its correlation ID rather than generating its own, so
 * the ID in logs, response headers and problem+json bodies always match.
 */
export function requestIdInterceptor() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : createId();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  };
}
