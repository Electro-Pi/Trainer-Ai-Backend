import { ConflictError, NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
import { eventBus } from '@/events/event-bus.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';
import { queueService } from '@/queue/queue-instance.js';

import type {
  BulkCreateContentDto,
  BulkMetadataEditDto,
  ContentFilterDto,
  CreateContentDto,
  UpdateContentDto,
} from '../dto/content.dto.js';
import type {
  ContentItem,
  ContentType,
  CoverageGapRow,
} from '../repositories/content-item.repository.js';
import { ContentItemRepository } from '../repositories/content-item.repository.js';
import { ContentOutcomeRepository } from '../repositories/content-outcome.repository.js';
import { MediaAssetRepository } from '../repositories/media-asset.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

export interface ContentWithOutcomes {
  item: ContentItem;
  outcomeIds: string[];
}

/** `content` module — P5-3, P5-7, P5-8, P5-9, P5-10. */
export class ContentService {
  private readonly contentItems = new ContentItemRepository();
  private readonly contentOutcomes = new ContentOutcomeRepository();
  private readonly mediaAssets = new MediaAssetRepository();

  /**
   * `CM-01` — every content item binds to exactly 1 track + 1 level +
   * ≥1 outcome, and every id must resolve inside the caller's own org
   * (never trust a request-supplied id without `findByIdScoped`, see MEMORY
   * "BaseRepository.findById() is a cross-tenant leak trap").
   */
  private async validateBinding(
    trackId: string,
    levelId: string,
    outcomeIds: string[],
  ): Promise<void> {
    const track = await trackRepository.findByIdScoped(trackId);
    if (!track) {
      throw new ValidationError([{ path: 'trackId', code: 'invalid', message: 'Track not found' }]);
    }

    const level = await levelRepository.findByIdScoped(levelId);
    if (!level || level.trackId !== trackId) {
      throw new ValidationError([
        { path: 'levelId', code: 'invalid', message: 'Level not found on this track' },
      ]);
    }

    if (outcomeIds.length === 0) {
      throw new ValidationError([
        {
          path: 'outcomeIds',
          code: 'required',
          message: 'At least one outcome is required (CM-01)',
        },
      ]);
    }

    const levelOutcomeIds = new Set(
      (await outcomeRepository.findByLevel(levelId)).map((o) => o.id),
    );
    const invalidId = outcomeIds.find((outcomeId) => !levelOutcomeIds.has(outcomeId));
    if (invalidId) {
      throw new ValidationError([
        {
          path: 'outcomeIds',
          code: 'invalid',
          message: `Outcome ${invalidId} not found on this level`,
        },
      ]);
    }
  }

  async list(filter: ContentFilterDto): Promise<PageResult<ContentItem>> {
    const where: Record<string, unknown> = {};
    if (filter.trackId) where['trackId'] = filter.trackId;
    if (filter.levelId) where['levelId'] = filter.levelId;
    if (filter.status) where['status'] = filter.status;
    if (filter.contentType) where['contentType'] = filter.contentType;
    if (filter.language) where['language'] = filter.language;

    return this.contentItems.findMany({
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
      ...(filter.cursor ? { cursor: filter.cursor } : {}),
      ...(Object.keys(where).length > 0 ? { where } : {}),
    });
  }

  /** Batched outcome-link lookup for list views — one query, not one per row. */
  async attachOutcomeIds(items: ContentItem[]): Promise<ContentWithOutcomes[]> {
    const links = await this.contentOutcomes.findByContentItems(items.map((i) => i.id));
    const byItem = new Map<string, string[]>();
    for (const link of links) {
      const list = byItem.get(link.contentItemId) ?? [];
      list.push(link.outcomeId);
      byItem.set(link.contentItemId, list);
    }
    return items.map((item) => ({ item, outcomeIds: byItem.get(item.id) ?? [] }));
  }

  async getById(id: string): Promise<ContentWithOutcomes> {
    const item = await this.contentItems.findByIdScoped(id);
    if (!item) {
      throw new NotFoundError('Content item not found');
    }
    const links = await this.contentOutcomes.findByContentItem(id);
    return { item, outcomeIds: links.map((l) => l.outcomeId) };
  }

  private async getItemOrThrow(id: string): Promise<ContentItem> {
    const item = await this.contentItems.findByIdScoped(id);
    if (!item) {
      throw new NotFoundError('Content item not found');
    }
    return item;
  }

  async create(actor: ActingUser, dto: CreateContentDto): Promise<ContentWithOutcomes> {
    await this.validateBinding(dto.trackId, dto.levelId, dto.outcomeIds);

    const created = await this.contentItems.create({
      title: dto.title,
      trackId: dto.trackId,
      levelId: dto.levelId,
      contentType: dto.contentType as ContentType,
      textBody: dto.textBody ?? null,
      sourceUrl: dto.sourceUrl ?? null,
      language: dto.language,
      estimatedMinutes: dto.estimatedMinutes,
      difficulty: dto.difficulty,
      isMandatory: dto.isMandatory ?? false,
      skillTags: dto.skillTags ?? [],
      createdById: actor.id,
    } as never);

    for (const outcomeId of dto.outcomeIds) {
      await this.contentOutcomes.link(created.id, outcomeId);
    }

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.created',
      entityType: 'ContentItem',
      entityId: created.id,
      after: { title: created.title, contentType: created.contentType, status: created.status },
    });

    return { item: created, outcomeIds: dto.outcomeIds };
  }

  async update(actor: ActingUser, id: string, dto: UpdateContentDto): Promise<ContentWithOutcomes> {
    const before = await this.getItemOrThrow(id);

    if (dto.outcomeIds) {
      await this.validateBinding(before.trackId, before.levelId, dto.outcomeIds);
      const existingLinks = await this.contentOutcomes.findByContentItem(id);
      for (const link of existingLinks) {
        await this.contentOutcomes.unlink(id, link.outcomeId);
      }
      for (const outcomeId of dto.outcomeIds) {
        await this.contentOutcomes.link(id, outcomeId);
      }
    }

    const updated = await this.contentItems.update(id, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.textBody !== undefined ? { textBody: dto.textBody } : {}),
      ...(dto.sourceUrl !== undefined ? { sourceUrl: dto.sourceUrl } : {}),
      ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
      ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
      ...(dto.isMandatory !== undefined ? { isMandatory: dto.isMandatory } : {}),
      ...(dto.skillTags !== undefined ? { skillTags: dto.skillTags } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.updated',
      entityType: 'ContentItem',
      entityId: id,
      before: { title: before.title },
      after: { title: updated.title },
    });

    const links = await this.contentOutcomes.findByContentItem(id);
    return { item: updated, outcomeIds: links.map((l) => l.outcomeId) };
  }

  /** `CM-12` lifecycle: `DRAFT` → `submit-review` → `IN_REVIEW` → `publish` → `PUBLISHED`; `archive` from any status. */
  async submitForReview(actor: ActingUser, id: string): Promise<ContentItem> {
    const before = await this.getItemOrThrow(id);
    if (before.status !== 'DRAFT') {
      throw new ConflictError(`Cannot submit for review from status ${before.status}`);
    }

    const updated = await this.contentItems.update(id, { status: 'IN_REVIEW' } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.submittedForReview',
      entityType: 'ContentItem',
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
    });

    return updated;
  }

  /**
   * `CM-12` — only `PUBLISHED`, malware-clean content is recommendable or
   * deliverable (non-negotiable 6). Any `PENDING`/`INFECTED`/`FAILED` media
   * on the item blocks publish outright (`CM-07`). Enqueues `content.embed`
   * after commit so semantic search/recommendation see the published text.
   */
  async publish(actor: ActingUser, id: string): Promise<ContentItem> {
    const before = await this.getItemOrThrow(id);
    if (before.status !== 'IN_REVIEW') {
      throw new ConflictError(`Cannot publish from status ${before.status}`);
    }

    const media = await this.mediaAssets.findByContentItem(id);
    const notClean = media.filter((m) => m.scanStatus !== 'CLEAN');
    if (notClean.length > 0) {
      throw new ConflictError(
        `Cannot publish while ${notClean.length} media asset(s) are not scan-CLEAN (CM-07)`,
      );
    }

    const updated = await this.contentItems.update(id, {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.published',
      entityType: 'ContentItem',
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
    });

    // Rule 1 (ARCHITECTURE §4.4) — publish only after the write commits.
    eventBus.publish('content.published', {
      contentItemId: id,
      organizationId: actor.organizationId,
    });

    await queueService.enqueue('content.embed', {
      contentItemId: id,
      organizationId: actor.organizationId,
    });

    return updated;
  }

  /**
   * `CM-14` — clones a content item into a new `DRAFT` at `version + 1`
   * without touching the original: in-progress `TrainingPlan`/`Session`
   * rows still reference the old (still-`PUBLISHED`) version's id, so
   * nothing breaks mid-flight. The old version is left exactly as-is —
   * versioning here is "branch a new draft," not "replace in place."
   */
  async newVersion(actor: ActingUser, id: string): Promise<ContentWithOutcomes> {
    const source = await this.getItemOrThrow(id);
    const sourceOutcomes = await this.contentOutcomes.findByContentItem(id);

    const created = await this.contentItems.create({
      title: source.title,
      trackId: source.trackId,
      levelId: source.levelId,
      contentType: source.contentType,
      textBody: source.textBody,
      sourceUrl: source.sourceUrl,
      language: source.language,
      estimatedMinutes: source.estimatedMinutes,
      difficulty: source.difficulty,
      isMandatory: source.isMandatory,
      skillTags: source.skillTags,
      createdById: actor.id,
      version: source.version + 1,
      parentVersionId: source.id,
    } as never);

    for (const link of sourceOutcomes) {
      await this.contentOutcomes.link(created.id, link.outcomeId);
    }

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.newVersionCreated',
      entityType: 'ContentItem',
      entityId: created.id,
      after: { sourceId: source.id, version: created.version },
    });

    return { item: created, outcomeIds: sourceOutcomes.map((l) => l.outcomeId) };
  }

  /** `CM-13` — outcomes with zero published content. Never silently skipped — surfaced as an explicit report (non-negotiable 11). */
  async getCoverageGaps(): Promise<CoverageGapRow[]> {
    return this.contentItems.findCoverageGaps();
  }

  /** `CM-08` — batch create with shared tags merged into each item's own `skillTags`. Each item is validated exactly like a single create. */
  async bulkCreate(actor: ActingUser, dto: BulkCreateContentDto): Promise<ContentWithOutcomes[]> {
    const results: ContentWithOutcomes[] = [];
    for (const item of dto.items) {
      const merged = dto.sharedTags?.length
        ? { ...item, skillTags: [...new Set([...(item.skillTags ?? []), ...dto.sharedTags])] }
        : item;
      results.push(await this.create(actor, merged));
    }
    return results;
  }

  /** `CM-16` — edits shared metadata fields across many content items in one call. */
  async bulkMetadataEdit(actor: ActingUser, dto: BulkMetadataEditDto): Promise<ContentItem[]> {
    const existing = await this.contentItems.findManyByIdsAnyStatus(dto.contentItemIds);
    const existingIds = new Set(existing.map((item) => item.id));
    const missingId = dto.contentItemIds.find((id) => !existingIds.has(id));
    if (missingId) {
      throw new NotFoundError(`Content item ${missingId} not found`);
    }

    const updated: ContentItem[] = [];
    for (const id of dto.contentItemIds) {
      const item = await this.contentItems.update(id, {
        ...(dto.skillTags !== undefined ? { skillTags: dto.skillTags } : {}),
        ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
        ...(dto.isMandatory !== undefined ? { isMandatory: dto.isMandatory } : {}),
      } as never);
      updated.push(item);
    }

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.bulkMetadataEdited',
      entityType: 'ContentItem',
      entityId: dto.contentItemIds[0] ?? 'n/a',
      after: {
        contentItemIds: dto.contentItemIds,
        skillTags: dto.skillTags,
        difficulty: dto.difficulty,
      },
    });

    return updated;
  }

  /** `CM-17` — archived content is retained, never deleted (non-negotiable 17), and drops out of recommendation. */
  async archive(actor: ActingUser, id: string): Promise<ContentItem> {
    const before = await this.getItemOrThrow(id);
    if (before.status === 'ARCHIVED') {
      throw new ConflictError('Content item is already archived');
    }

    const updated = await this.contentItems.update(id, {
      status: 'ARCHIVED',
      archivedAt: new Date(),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.archived',
      entityType: 'ContentItem',
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
    });

    return updated;
  }
}
