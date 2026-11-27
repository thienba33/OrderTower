// SPDX-License-Identifier: Apache-2.0

export type NotificationType = 'sla.overdue' | 'sla.escalation';

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  actionHref: string | null;
  audienceRole: string | null;
  audienceUser: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  actionHref?: string | null;
  audienceRole?: string | null;
  audienceUser?: string | null;
  dedupKey?: string | null;
}

export interface NotificationList {
  items: Notification[];
  unreadCount: number;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
  limit?: number;
}
