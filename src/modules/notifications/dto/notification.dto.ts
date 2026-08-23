export interface NotificationResponseDto {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponseDto {
  data: NotificationResponseDto[];
  unreadCount: number;
}

export interface MarkAllReadResponseDto {
  markedCount: number;
}
