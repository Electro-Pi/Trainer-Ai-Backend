import type { Notification, NotificationType } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Notification, NotificationType };

type NotificationDelegate = typeof prisma.notification;

export class NotificationRepository extends BaseRepository<Notification, NotificationDelegate> {
  constructor() {
    super(prisma.notification, 'createdAt');
  }

  async findByIdScoped(id: string): Promise<Notification | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  async listForRecipient(
    recipientPortalUserId: string,
    options: { limit: number; unreadOnly?: boolean },
  ): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        recipientPortalUserId,
        ...(options.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
  }

  async countUnread(recipientPortalUserId: string): Promise<number> {
    return prisma.notification.count({ where: { recipientPortalUserId, readAt: null } });
  }

  async markAllRead(recipientPortalUserId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { recipientPortalUserId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
