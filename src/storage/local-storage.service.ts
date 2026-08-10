import { createHmac } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';

import { ExternalServiceError, NotFoundError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import type { StorageBlobListing, StorageService } from '@/shared-types.js';

/**
 * Dev/test default (ARCHITECTURE §4.5, D-14) — writes under `STORAGE_LOCAL_PATH`
 * on local disk. There is no real SAS mechanism for a filesystem, so "download
 * URL" is an HMAC-SHA256-signed, time-limited link served by
 * `local-blobs.routes.ts` — the signature and expiry are genuinely verified
 * there, not decorative, so a tampered or expired link is rejected exactly
 * like a real cloud SAS URL would be.
 */
export function signLocalBlobToken(blobKey: string, expiresAt: number): string {
  return createHmac('sha256', env.ENCRYPTION_KEY)
    .update(`${blobKey}:${expiresAt}`)
    .digest('base64url');
}

export function resolveLocalBlobPath(blobKey: string): string {
  const root = env.STORAGE_LOCAL_PATH;
  const target = normalize(join(root, blobKey));
  const rel = relative(root, target);
  if (rel.startsWith('..')) {
    throw new ExternalServiceError('Invalid storage key');
  }
  return target;
}

export class LocalStorageService implements StorageService {
  async upload(blobKey: string, data: Buffer, _contentType: string): Promise<void> {
    const path = resolveLocalBlobPath(blobKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async getDownloadUrl(blobKey: string, expiresInSeconds = 3600): Promise<string> {
    const path = resolveLocalBlobPath(blobKey);
    try {
      await stat(path);
    } catch {
      throw new NotFoundError('Blob not found');
    }
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const token = signLocalBlobToken(blobKey, expiresAt);
    // Each path segment is percent-encoded individually so `/` stays a real
    // separator — the serving route splits on it via Express 5's `/*blobKey`
    // wildcard array param and rejoins before verifying the signature.
    const encodedPath = blobKey.split('/').map(encodeURIComponent).join('/');
    return `${env.APP_URL}/api/v1/local-blobs/${encodedPath}?token=${token}&expiresAt=${expiresAt}`;
  }

  async delete(blobKey: string): Promise<void> {
    const path = resolveLocalBlobPath(blobKey);
    await rm(path, { force: true });
  }

  async list(): Promise<StorageBlobListing[]> {
    const root = env.STORAGE_LOCAL_PATH;
    const blobs: StorageBlobListing[] = [];

    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        const fileStat = await stat(fullPath);
        blobs.push({
          blobKey: relative(root, fullPath).split('\\').join('/'),
          createdAt: fileStat.birthtime,
        });
      }
    }

    await walk(root);
    return blobs;
  }
}
