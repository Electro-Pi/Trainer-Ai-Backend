import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
import { skillRepository } from '@/modules/skills/skills.module.js';

import type { ContentFilterDto, CreateContentDto, UpdateContentDto } from '../dto/content.dto.js';
import type { ContentItem } from '../repositories/content-item.repository.js';
import { ContentItemRepository } from '../repositories/content-item.repository.js';
import { MediaAssetRepository } from '../repositories/media-asset.repository.js';

import { MediaService } from './media.service.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `content` module — one uploaded document per row, scoped directly to a skill. */
export class ContentService {
  private readonly contentItems = new ContentItemRepository();
  private readonly mediaAssets = new MediaAssetRepository();
  private readonly media = new MediaService();

  async list(filter: ContentFilterDto): Promise<PageResult<ContentItem>> {
    return this.contentItems.findMany({
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
      ...(filter.cursor ? { cursor: filter.cursor } : {}),
      ...(filter.skillId ? { where: { skillId: filter.skillId } } : {}),
    });
  }

  async getById(id: string): Promise<ContentItem> {
    const item = await this.contentItems.findByIdScoped(id);
    if (!item) {
      throw new NotFoundError('Content item not found');
    }
    return item;
  }

  private async getItemOrThrow(id: string): Promise<ContentItem> {
    return this.getById(id);
  }

  async create(actor: ActingUser, dto: CreateContentDto): Promise<ContentItem> {
    const skill = await skillRepository.findByIdScoped(dto.skillId);
    if (!skill) {
      throw new ValidationError([{ path: 'skillId', code: 'invalid', message: 'Skill not found' }]);
    }

    const created = await this.contentItems.create({
      skillId: dto.skillId,
      name: dto.name,
      createdById: actor.id,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.created',
      entityType: 'ContentItem',
      entityId: created.id,
      after: { name: created.name, skillId: created.skillId },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateContentDto): Promise<ContentItem> {
    const before = await this.getItemOrThrow(id);

    const updated = await this.contentItems.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.updated',
      entityType: 'ContentItem',
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
    });

    return updated;
  }

  async delete(actor: ActingUser, id: string): Promise<void> {
    const before = await this.getItemOrThrow(id);
    const media = await this.mediaAssets.findByContentItem(id);
    for (const asset of media) {
      await this.media.delete(actor, asset.id);
    }
    await this.contentItems.delete(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'content.deleted',
      entityType: 'ContentItem',
      entityId: id,
      before: { name: before.name, skillId: before.skillId },
    });
  }
}
