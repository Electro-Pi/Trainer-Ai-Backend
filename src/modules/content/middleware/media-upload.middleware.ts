import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { MAX_UPLOAD_SIZE_BYTES } from '@/config/constants.js';
import { getCurrentOrganizationId, runWithTenant } from '@/database/tenant-context.js';

/**
 * Memory storage, not disk — `StorageService.upload()` (P5-1) takes a
 * `Buffer` regardless of provider, and the MIME sniff (`CM-04`) needs the
 * bytes before any storage decision is made. Size is capped here at the
 * multer layer so an oversized upload is rejected before it fully buffers.
 */
const parseSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
}).single('file');

/**
 * `multer` + a re-entry into the request's tenant context.
 *
 * `tenantScope()` puts `organizationId` in an `AsyncLocalStorage` frame that
 * normally survives every `await` down the handler chain. Multer breaks out
 * of it: it parses the body through stream event handlers registered outside
 * that frame, so its `next()` resolves with an empty store. Every
 * tenant-scoped query in the upload handler then hit the extension's
 * "ran outside runWithTenant() — refusing to execute unscoped" guard and the
 * whole request 500'd — which is what made uploads look like a storage
 * provider problem when the provider was fine.
 *
 * Captured before parsing and restored after, so the handler runs in the same
 * tenant as the rest of the request.
 */
export function mediaUpload(req: Request, res: Response, next: NextFunction): void {
  const organizationId = getCurrentOrganizationId();

  parseSingleFile(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    // No tenant to restore (an unauthenticated route, in theory) — behave
    // exactly as before rather than inventing a scope.
    if (!organizationId) {
      next();
      return;
    }
    runWithTenant(organizationId, () => {
      next();
    });
  });
}
