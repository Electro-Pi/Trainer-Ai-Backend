import { UTApi, UTFile } from 'uploadthing/server';

import { env } from '@/config/env.js';
import type { StorageBlobListing, StorageService } from '@/shared-types.js';

/** File storage backed by UploadThing (ARCHITECTURE §4.5) — the sole storage provider. */
export class UploadThingStorageService implements StorageService {
  private readonly client = new UTApi({ token: env.UPLOADTHING_TOKEN });

  async upload(blobKey: string, data: Buffer, contentType: string): Promise<void> {
    const file = new UTFile([data], blobKey, { type: contentType, customId: blobKey });
    const [result] = await this.client.uploadFiles([file]);
    if (!result || result.error) {
      throw new Error(`UploadThing upload failed for ${blobKey}: ${result?.error?.message}`);
    }
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
