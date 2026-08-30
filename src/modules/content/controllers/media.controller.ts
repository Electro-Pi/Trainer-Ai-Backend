import type { Request, Response } from 'express';

import { ValidationError } from '@/common/exceptions/app-error.js';
import type { AuthContext } from '@/common/types/express.js';
import { logger } from '@/logger/logger.service.js';

import type { MediaResponseDto } from '../dto/content.dto.js';
import type { MediaAsset } from '../repositories/media-asset.repository.js';
import { MediaService, type ActingUser } from '../services/media.service.js';

const service = new MediaService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

async function toMediaResponseDto(
  asset: MediaAsset,
  service_: MediaService,
): Promise<MediaResponseDto> {
  // Minting a signed URL is a second round trip to the storage provider,
  // made *after* the upload and the DB row both succeeded. Letting it throw
  // failed the whole request — and the caller retried an upload that had
  // actually worked — so a failure here degrades to a null URL instead.
  // The asset is already persisted; any later read can mint one again.
  const downloadUrl = await service_.getDownloadUrl(asset.id).catch((err: unknown) => {
    logger.warn(
      { mediaAssetId: asset.id, err },
      'Could not mint a download URL for a freshly uploaded asset',
    );
    return null;
  });
  return {
    id: asset.id,
    contentItemId: asset.contentItemId,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    checksum: asset.checksum,
    caption: asset.caption,
    altTextEn: asset.altTextEn,
    altTextAr: asset.altTextAr,
    extractedText: asset.extractedText,
    pageCount: asset.pageCount,
    scanStatus: asset.scanStatus,
    downloadUrl,
    createdAt: asset.createdAt.toISOString(),
  };
}

export class MediaController {
  async upload(req: Request, res: Response): Promise<void> {
    const { id: contentItemId } = req.params as { id: string };
    const { caption } = req.body as { caption?: string };

    if (!req.file) {
      throw new ValidationError([
        { path: 'file', code: 'required', message: 'A file is required' },
      ]);
    }

    const created = await service.upload(toActingUser(req.auth!), contentItemId, {
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      caption,
    });

    res.status(201).json(await toMediaResponseDto(created, service));
  }

  async listByContentItem(req: Request, res: Response): Promise<void> {
    const { id: contentItemId } = req.params as { id: string };
    const assets = await service.listByContentItem(contentItemId);
    res
      .status(200)
      .json({ data: await Promise.all(assets.map((a) => toMediaResponseDto(a, service))) });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.delete(toActingUser(req.auth!), id);
    res.status(204).send();
  }
}
