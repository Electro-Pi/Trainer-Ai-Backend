import multer from 'multer';

import { MAX_UPLOAD_SIZE_BYTES } from '@/config/constants.js';

/**
 * Memory storage, not disk — `StorageService.upload()` (P5-1) takes a
 * `Buffer` regardless of provider, and the MIME sniff (`CM-04`) needs the
 * bytes before any storage decision is made. Size is capped here at the
 * multer layer so an oversized upload is rejected before it fully buffers.
 */
export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
}).single('file');
