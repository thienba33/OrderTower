// SPDX-License-Identifier: Apache-2.0

export type ApiNotificationType = "sla.overdue" | "sla.escalation";

export interface ApiNotification {
  id: number;
  type: ApiNotificationType;
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

export interface ApiNotificationList {
  items: ApiNotification[];
  unreadCount: number;
}

export interface ApiNotificationPage {
  items: ApiNotification[];
  total: number;
  limit: number;
  offset: number;
}
