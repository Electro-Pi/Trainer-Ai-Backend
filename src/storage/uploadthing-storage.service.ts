import { UTApi, UTFile } from 'uploadthing/server';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';
import type { StorageBlobListing, StorageService } from '@/shared-types.js';

const UPLOAD_RETRY_ATTEMPTS = 5;
const UPLOAD_RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** File storage backed by UploadThing (ARCHITECTURE §4.5) — the sole storage provider. */
export class UploadThingStorageService implements StorageService {
  private readonly client = new UTApi({ token: env.UPLOADTHING_TOKEN });

  /**
   * UploadThing occasionally returns a transient "unexpected error" /
   * "dependency unavailable" — observed directly against the live API as
   * their own backend failing to insert a row into its `file` table, not a
   * config issue on our end — that clears up within a few seconds. A user
   * saving a track with several files could see some fail while others on
   * the exact same request succeed. 5 attempts with exponential backoff
   * (500ms, 1s, 2s, 4s between tries — ~7.5s total) absorbs a blip like that
   * instead of surfacing it as a permanent failure.
   */
  async upload(blobKey: string, data: Buffer, contentType: string): Promise<void> {
    const file = new UTFile([data], blobKey, { type: contentType, customId: blobKey });

    let lastMessage = 'no result returned';
    for (let attempt = 1; attempt <= UPLOAD_RETRY_ATTEMPTS; attempt++) {
      let result;
      try {
        [result] = await this.client.uploadFiles([file]);
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : 'unknown error';
      }
      if (result && !result.error) return;
      if (result?.error) lastMessage = result.error.message;

      if (attempt < UPLOAD_RETRY_ATTEMPTS) {
        logger.warn(
          { blobKey, attempt, error: lastMessage },
          'UploadThing upload failed, retrying',
        );
        await sleep(UPLOAD_RETRY_DELAY_MS * 2 ** (attempt - 1));
      }
    }

    throw new ExternalServiceError(`UploadThing upload failed for ${blobKey}: ${lastMessage}`);
  }

  async getDownloadUrl(blobKey: string, expiresInSeconds = 3600): Promise<string> {
    const { ufsUrl } = await this.client.generateSignedURL(blobKey, {
      expiresIn: expiresInSeconds,
    });
    return ufsUrl;
  }

  async delete(blobKey: string): Promise<void> {
    await this.client.deleteFiles(blobKey, { keyType: 'customId' });
  }

  async list(): Promise<StorageBlobListing[]> {
    const blobs: StorageBlobListing[] = [];
    let hasMore = true;
    let offset = 0;
    while (hasMore) {
      const page = await this.client.listFiles({ offset, limit: 500 });
      for (const file of page.files) {
        blobs.push({ blobKey: file.customId ?? file.key, createdAt: new Date(file.uploadedAt) });
      }
      hasMore = page.hasMore;
      offset += page.files.length;
    }
    return blobs;
  }
}
