import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { Router } from 'express';

import { ForbiddenError, NotFoundError } from '@/common/exceptions/app-error.js';

import { resolveLocalBlobPath, signLocalBlobToken } from './local-storage.service.js';

/**
 * Serves `LocalStorageService`'s dev-only "SAS" links (§4.5). Mounted
 * unauthenticated — the HMAC token + expiry check IS the access control,
 * mirroring how a real cloud SAS URL grants access without a bearer token.
 * Never used when `STORAGE_PROVIDER=azure`.
 */
export function createLocalBlobsRouter(): Router {
  const router = Router();

  router.get('/*blobKey', (req, res, next) => {
    try {
      const segments = req.params['blobKey'] as string[];
      const blobKey = segments.join('/');
      const { token, expiresAt } = req.query as { token?: string; expiresAt?: string };

      if (!token || !expiresAt) {
        throw new ForbiddenError('Missing signature');
      }

      const expiresAtNum = Number(expiresAt);
      if (!Number.isFinite(expiresAtNum) || Date.now() > expiresAtNum) {
        throw new ForbiddenError('Link expired');
      }

      const expected = signLocalBlobToken(blobKey, expiresAtNum);
      const expectedBuf = Buffer.from(expected);
      const givenBuf = Buffer.from(token);
      if (expectedBuf.length !== givenBuf.length || !timingSafeEqual(expectedBuf, givenBuf)) {
        throw new ForbiddenError('Invalid signature');
      }

      const path = resolveLocalBlobPath(blobKey);
      const stream = createReadStream(path);
      stream.on('error', () => next(new NotFoundError('Blob not found')));
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
