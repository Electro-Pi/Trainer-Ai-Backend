import { UTApi, UTFile } from 'uploadthing/server';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';
import type { StorageBlobListing, StorageService } from '@/shared-types.js';

const UPLOAD_RETRY_ATTEMPTS = 5;
const UPLOAD_RETRY_DELAY_MS = 500;
/** Fewer than uploads: signing is cheap and sits in a response path, so a long retry chain would just stall the request. */
const SIGN_RETRY_ATTEMPTS = 3;

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

    logger.error(
      {
        blobKey,
        contentType,
        sizeBytes: data.length,
        attempts: UPLOAD_RETRY_ATTEMPTS,
        error: lastMessage,
      },
      'UploadThing upload failed after all retries',
    );
    throw new ExternalServiceError(`UploadThing upload failed for ${blobKey}: ${lastMessage}`);
  }

  /**
   * Retried like `upload` above, and for the same reason — the same transient
   * provider failures hit signing too. Callers that mint a URL as part of a
   * write's response (media upload) must additionally tolerate a throw here:
   * the write already succeeded, so failing the request would make the caller
   * retry work that was actually done.
   */
  async getDownloadUrl(blobKey: string, expiresInSeconds = 3600): Promise<string> {
    let lastMessage = 'no result returned';
    for (let attempt = 1; attempt <= SIGN_RETRY_ATTEMPTS; attempt++) {
      try {
        const { ufsUrl } = await this.client.generateSignedURL(blobKey, {
          expiresIn: expiresInSeconds,
        });
        return ufsUrl;
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : 'unknown error';
        if (attempt < SIGN_RETRY_ATTEMPTS) {
          await sleep(UPLOAD_RETRY_DELAY_MS * 2 ** (attempt - 1));
        }
      }
    }
    logger.warn({ blobKey, error: lastMessage }, 'UploadThing signed-URL generation failed');
    throw new ExternalServiceError(`UploadThing signing failed for ${blobKey}: ${lastMessage}`);
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
