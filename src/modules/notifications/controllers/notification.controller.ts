import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type {
  MarkAllReadResponseDto,
  NotificationListResponseDto,
  NotificationResponseDto,
} from '../dto/notification.dto.js';
import type { Notification } from '../repositories/notification.repository.js';
import { type ActingUser, NotificationService } from '../services/notification.service.js';

const service = new NotificationService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(notification: Notification, locale: string): NotificationResponseDto {
  const isAr = locale === 'AR';
  return {
    id: notification.id,
    type: notification.type,
    entityType: notification.entityType,
    entityId: notification.entityId,
    title: isAr ? notification.titleAr : notification.titleEn,
    body: (isAr ? notification.bodyAr : notification.bodyEn) ?? null,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export class NotificationController {
  async list(req: Request, res: Response): Promise<void> {
    const { limit, unreadOnly } = req.query as unknown as { limit: number; unreadOnly?: boolean };
    const { rows, unreadCount, locale } = await service.list(
      toActingUser(req.auth!),
      limit,
      unreadOnly,
    );
    const body: NotificationListResponseDto = {
      data: rows.map((n) => toResponseDto(n, locale)),
      unreadCount,
    };
    res.status(200).json(body);
  }

  async markRead(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const notification = await service.markRead(toActingUser(req.auth!), id);
    const user = await portalUserRepository.findById(req.auth!.sub);
    res.status(200).json(toResponseDto(notification, user?.locale ?? 'EN'));
  }

  async markAllRead(req: Request, res: Response): Promise<void> {
    const markedCount = await service.markAllRead(toActingUser(req.auth!));
    const body: MarkAllReadResponseDto = { markedCount };
    res.status(200).json(body);
  }
}
