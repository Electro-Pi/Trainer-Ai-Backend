import { createHash, randomUUID } from 'node:crypto';

import { fileTypeFromBuffer } from 'file-type';

import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { container } from '@/config/container.js';
import { queueService } from '@/queue/queue-instance.js';
import type { StorageService } from '@/shared-types.js';

import type { PlanContentMedia } from '../repositories/plan-content-media.repository.js';
import { PlanContentMediaRepository } from '../repositories/plan-content-media.repository.js';
import { PlanTrackSnapshotRepository } from '../repositories/plan-track-snapshot.repository.js';

const MEDIA_CONTENT_TYPES = ['DOCUMENT', 'SLIDES', 'IMAGE'] as const;

// `PlanContentSnapshot` (this file's model) is a separate, plan-scoped copy
// of content that still carries its own `contentType` — unlike the master
// catalogue's `ContentItem`, it wasn't narrowed to document-only by the
// content restructure, so it keeps its own MIME allowlist here.
const PLAN_CONTENT_MIME_ALLOWLIST_BY_TYPE = {
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  SLIDES: [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  IMAGE: ['image/png', 'image/jpeg', 'image/webp'],
  TEXT: [],
  LINK: [],
} as const;

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

export interface UploadPlanContentMediaInput {
  buffer: Buffer;
  originalFilename: string;
}

/**
 * Plan-snapshot counterpart to `content/services/media.service.ts` —
 * same magic-byte MIME sniff, checksum, and malware-scan queue kickoff, but
 * writes to `PlanContentMedia` (keyed by `contentSnapshotId`) instead of
 * `MediaAsset`, so an upload here never touches the master catalogue.
 */
export class PlanContentMediaService {
  private readonly media = new PlanContentMediaRepository();
  private readonly snapshots = new PlanTrackSnapshotRepository();

  async upload(
    actor: ActingUser,
    trainingPlanId: string,
    contentSnapshotId: string,
    input: UploadPlanContentMediaInput,
  ): Promise<PlanContentMedia> {
    const tree = await this.snapshots.findByTrainingPlanId(trainingPlanId);
    if (!tree) {
      throw new NotFoundError('This plan has no track snapshot yet');
    }
    const content = await this.snapshots.findContentById(contentSnapshotId);
    if (!content || content.snapshotId !== tree.id) {
      throw new NotFoundError('Content snapshot not found on this plan');
    }
    if (
      !MEDIA_CONTENT_TYPES.includes(content.contentType as (typeof MEDIA_CONTENT_TYPES)[number])
    ) {
      throw new ValidationError([
        {
          path: 'contentSnapshotId',
          code: 'invalid',
          message: `Content type ${content.contentType} does not accept media uploads`,
        },
      ]);
    }

    const sniffed = await fileTypeFromBuffer(input.buffer);
    const allowlist =
      PLAN_CONTENT_MIME_ALLOWLIST_BY_TYPE[
        content.contentType as keyof typeof PLAN_CONTENT_MIME_ALLOWLIST_BY_TYPE
      ];
    if (!sniffed || !(allowlist as readonly string[]).includes(sniffed.mime)) {
      throw new ValidationError([
        {
          path: 'file',
          code: 'invalid_mime',
          message: `File content does not match an allowed type for ${content.contentType}`,
        },
      ]);
    }

    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const blobKey = `plan-content/${content.id}/${randomUUID()}-${input.originalFilename}`;

    const storage = container.resolveStorage<StorageService>();
    await storage.upload(blobKey, input.buffer, sniffed.mime);

    const created = await this.media.create({
      contentSnapshotId: content.id,
      blobKey,
      originalFilename: input.originalFilename,
      mimeType: sniffed.mime,
      sizeBytes: input.buffer.length,
      checksum,
      scanStatus: 'PENDING',
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_content_media.uploaded',
      entityType: 'PlanContentMedia',
      entityId: created.id,
      after: {
        contentSnapshotId: content.id,
        mimeType: sniffed.mime,
        sizeBytes: created.sizeBytes,
      },
    });

    await queueService.enqueue('media.scan', {
      mediaAssetId: created.id,
      organizationId: actor.organizationId,
    });

    return created;
  }

  async getDownloadUrl(mediaId: string): Promise<string> {
    const asset = await this.media.findById(mediaId);
    if (!asset) {
      throw new NotFoundError('Media asset not found');
    }
    const storage = container.resolveStorage<StorageService>();
    return storage.getDownloadUrl(asset.blobKey);
  }

  async listByContentSnapshot(contentSnapshotId: string): Promise<PlanContentMedia[]> {
    return this.media.findByContentSnapshot(contentSnapshotId);
  }
}
