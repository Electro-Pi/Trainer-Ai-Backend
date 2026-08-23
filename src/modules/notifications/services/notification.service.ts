import { NotFoundError, ForbiddenError } from '@/common/exceptions/app-error.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import {
  NotificationRepository,
  type Notification,
} from '../repositories/notification.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

const notifications = new NotificationRepository();

/**
 * Notifications are always read/written for the caller themselves — there's
 * no "view someone else's notifications" case in this portal, so every
 * method here is scoped to `actor.id` rather than taking a separate
 * recipient id.
 */
export class NotificationService {
  async list(actor: ActingUser, limit: number, unreadOnly?: boolean) {
    const [rows, unreadCount, user] = await Promise.all([
      notifications.listForRecipient(actor.id, {
        limit,
        ...(unreadOnly !== undefined ? { unreadOnly } : {}),
      }),
      notifications.countUnread(actor.id),
      portalUserRepository.findById(actor.id),
    ]);
    return { rows, unreadCount, locale: user?.locale ?? 'EN' };
  }

  async markRead(actor: ActingUser, id: string): Promise<Notification> {
    const notification = await notifications.findByIdScoped(id);
    if (!notification) {
      throw new NotFoundError('Notification not found');
    }
    if (notification.recipientPortalUserId !== actor.id) {
      throw new ForbiddenError('Not your notification');
    }
    if (notification.readAt) {
      return notification;
    }
    return notifications.update(id, { readAt: new Date() } as never);
  }

  async markAllRead(actor: ActingUser): Promise<number> {
    return notifications.markAllRead(actor.id);
  }
}
