import { createHash, randomUUID } from 'node:crypto';

import { fileTypeFromBuffer } from 'file-type';

import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { DOCUMENT_MIME_ALLOWLIST } from '@/config/constants.js';
import { container } from '@/config/container.js';
import type { StorageService } from '@/shared-types.js';

import { ContentItemRepository } from '../repositories/content-item.repository.js';
import type { MediaAsset } from '../repositories/media-asset.repository.js';
import { MediaAssetRepository } from '../repositories/media-asset.repository.js';

import type { ActingUser } from './content.service.js';

export type { ActingUser };

export interface UploadMediaInput {
  buffer: Buffer;
  originalFilename: string;
  caption?: string | undefined;
}

/** `content/media` — P5-4. Magic-byte MIME sniff, size cap (multer layer), checksum. No malware scan (removed — see git history). */
export class MediaService {
  private readonly contentItems = new ContentItemRepository();
  private readonly mediaAssets = new MediaAssetRepository();

  async upload(
    actor: ActingUser,
    contentItemId: string,
    input: UploadMediaInput,
  ): Promise<MediaAsset> {
    const contentItem = await this.contentItems.findByIdScoped(contentItemId);
    if (!contentItem) {
      throw new NotFoundError('Content item not found');
    }

    const sniffed = await fileTypeFromBuffer(input.buffer);
    if (!sniffed || !(DOCUMENT_MIME_ALLOWLIST as readonly string[]).includes(sniffed.mime)) {
      throw new ValidationError([
        {
          path: 'file',
          code: 'invalid_mime',
          message: 'File content does not match an allowed document type',
        },
      ]);
    }

    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const blobKey = `content/${contentItem.id}/${randomUUID()}-${input.originalFilename}`;

    const storage = container.resolveStorage<StorageService>();
    await storage.upload(blobKey, input.buffer, sniffed.mime);

    const created = await this.mediaAssets.create({
      contentItemId: contentItem.id,
      blobKey,
      originalFilename: input.originalFilename,
      mimeType: sniffed.mime,
      sizeBytes: input.buffer.length,
      checksum,
      caption: input.caption ?? null,
      altTextEn: null,
      altTextAr: null,
      scanStatus: 'CLEAN',
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'media.uploaded',
      entityType: 'MediaAsset',
      entityId: created.id,
      after: {
        contentItemId: contentItem.id,
        mimeType: sniffed.mime,
        sizeBytes: created.sizeBytes,
      },
    });

    return created;
  }

  async listByContentItem(contentItemId: string): Promise<MediaAsset[]> {
    return this.mediaAssets.findByContentItem(contentItemId);
  }

  async getDownloadUrl(mediaAssetId: string): Promise<string> {
    const asset = await this.mediaAssets.findById(mediaAssetId);
    if (!asset) {
      throw new NotFoundError('Media asset not found');
    }
    const storage = container.resolveStorage<StorageService>();
    return storage.getDownloadUrl(asset.blobKey);
  }

  async delete(actor: ActingUser, mediaAssetId: string): Promise<void> {
    const asset = await this.mediaAssets.findById(mediaAssetId);
    if (!asset) {
      throw new NotFoundError('Media asset not found');
    }

    const storage = container.resolveStorage<StorageService>();
    await storage.delete(asset.blobKey);
    await this.mediaAssets.delete(mediaAssetId);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'media.deleted',
      entityType: 'MediaAsset',
      entityId: mediaAssetId,
      before: { blobKey: asset.blobKey },
    });
  }
}
