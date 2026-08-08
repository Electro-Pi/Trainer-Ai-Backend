import type { Request, Response } from 'express';

import { ValidationError } from '@/common/exceptions/app-error.js';
import type { AuthContext } from '@/common/types/express.js';

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
  const downloadUrl = await service_.getDownloadUrl(asset.id);
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
    const { caption, altTextEn, altTextAr } = req.body as {
      caption?: string;
      altTextEn?: string;
      altTextAr?: string;
    };

    if (!req.file) {
      throw new ValidationError([
        { path: 'file', code: 'required', message: 'A file is required' },
      ]);
    }

    const created = await service.upload(toActingUser(req.auth!), contentItemId, {
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      caption,
      altTextEn,
      altTextAr,
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
