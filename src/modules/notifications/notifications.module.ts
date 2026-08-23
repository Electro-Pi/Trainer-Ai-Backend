import { openApiRegistry } from '@/swagger/swagger.js';

import { createNotificationsRouter } from './notifications.routes.js';
import {
  NotificationRepository,
  type NotificationType,
} from './repositories/notification.repository.js';

export const notificationsRouter = createNotificationsRouter();

const notificationRepository = new NotificationRepository();

export interface WriteNotificationEntry {
  organizationId: string;
  recipientPortalUserId: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
  titleEn: string;
  titleAr: string;
  bodyEn?: string;
  bodyAr?: string;
}

/**
 * Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — every other
 * module writes a notification row through this instead of deep-importing
 * `modules/notifications/repositories/*`. Mirrors `writeAuditLog`'s shape:
 * fire-and-forget-safe (never throws into the caller's mutation flow — a
 * failed notification write must not fail the underlying business action),
 * called inline after the real mutation succeeds, not inside its
 * transaction (notifications are advisory, not part of the source of truth
 * the way an audit log row is).
 */
export async function writeNotification(entry: WriteNotificationEntry): Promise<void> {
  try {
    await notificationRepository.create({
      organizationId: entry.organizationId,
      recipientPortalUserId: entry.recipientPortalUserId,
      type: entry.type,
      entityType: entry.entityType,
      entityId: entry.entityId,
      titleEn: entry.titleEn,
      titleAr: entry.titleAr,
      bodyEn: entry.bodyEn ?? null,
      bodyAr: entry.bodyAr ?? null,
    } as never);
  } catch {
    // Notifications are advisory — never let a failed write break the
    // mutation that triggered it.
  }
}

openApiRegistry.registerPath({
  method: 'get',
  path: '/notifications',
  tags: ['Notifications'],
  summary: 'Lists the caller’s own in-app notifications, newest first',
  responses: { 200: { description: 'Notification list with unread count' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/notifications/{id}/read',
  tags: ['Notifications'],
  summary: 'Marks one of the caller’s own notifications as read',
  responses: { 200: { description: 'Updated notification' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/notifications/read-all',
  tags: ['Notifications'],
  summary: 'Marks all of the caller’s own unread notifications as read',
  responses: { 200: { description: 'Count of notifications marked read' } },
});
