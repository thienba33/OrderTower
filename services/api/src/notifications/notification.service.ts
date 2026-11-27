// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Caller } from '../auth/auth.types';
import { DbService } from '../db/db.service';
import type {
  NewNotification,
  Notification,
  NotificationFilters,
  NotificationList,
  NotificationPage,
  NotificationType,
} from './notification.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: Record<string, unknown>): Notification {
  return {
    id: Number(row.id),
    type: row.type as NotificationType,
    title: row.title as string,
    body: row.body as string,
    entityType: (row.entity_type as string | null) ?? null,
    entityId: (row.entity_id as string | null) ?? null,
    actionHref: (row.action_href as string | null) ?? null,
    audienceRole: (row.audience_role as string | null) ?? null,
    audienceUser: (row.audience_user as string | null) ?? null,
    readAt:
      row.read_at === null || row.read_at === undefined
        ? null
        : toIso(row.read_at),
    createdAt: toIso(row.created_at),
  };
}

const COLUMNS = `id, type, title, body, entity_type, entity_id, action_href,
  audience_role, audience_user, read_at, created_at`;

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DbService) {}

  // Notification không gắn user/role là thông báo chung cho mọi vai nội bộ.
  private visibility(
    caller: Caller,
    params: unknown[],
  ): { clause: string; params: unknown[] } {
    params.push(caller.username);
    const userIndex = params.length;
    params.push([...caller.roles]);
    const rolesIndex = params.length;
    return {
      clause: `(audience_user = $${userIndex}
        OR audience_role = ANY($${rolesIndex}::text[])
        OR (audience_user IS NULL AND audience_role IS NULL))`,
      params,
    };
  }

  async list(
    caller: Caller,
    filters: NotificationFilters,
  ): Promise<NotificationList> {
    const limit = filters.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`,
      );
    }
    const visible = this.visibility(caller, []);
    const unread = await this.db.query(
      `SELECT COUNT(*)::int AS count
         FROM notifications
        WHERE read_at IS NULL AND ${visible.clause}`,
      visible.params,
    );
    const params = [...visible.params];
    const readClause = filters.unreadOnly ? 'AND read_at IS NULL' : '';
    params.push(limit);
    const rows = await this.db.query(
      `SELECT ${COLUMNS}
         FROM notifications
        WHERE ${visible.clause} ${readClause}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );
    return {
      items: (rows.rows as Array<Record<string, unknown>>).map(mapRow),
      unreadCount: Number(
        (unread.rows[0] as { count?: number } | undefined)?.count ?? 0,
      ),
    };
  }

  // Admin xem toàn bộ notification trong tenant để kiểm tra escalation.
  async listAll(limit = DEFAULT_LIMIT): Promise<Notification[]> {
    return (await this.listAllPage(limit, 0)).items;
  }

  async listAllPage(
    limit = DEFAULT_LIMIT,
    offset = 0,
  ): Promise<NotificationPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`,
      );
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new BadRequestException('offset phải là số nguyên không âm.');
    }
    const [countResult, rows] = await Promise.all([
      this.db.query('SELECT COUNT(*)::int AS count FROM notifications'),
      this.db.query(
        `SELECT ${COLUMNS}
           FROM notifications
          ORDER BY created_at DESC, id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
    ]);
    return {
      items: (rows.rows as Array<Record<string, unknown>>).map(mapRow),
      total: Number(
        (countResult.rows[0] as { count?: number } | undefined)?.count ?? 0,
      ),
      limit,
      offset,
    };
  }

  // Trả null khi dedup_key đã tồn tại, để job biết không tạo thêm.
  async create(input: NewNotification): Promise<Notification | null> {
    const params = [
      input.type,
      input.title,
      input.body,
      input.entityType ?? null,
      input.entityId ?? null,
      input.actionHref ?? null,
      input.audienceRole ?? null,
      input.audienceUser ?? null,
      input.dedupKey ?? null,
    ];
    const conflict = input.dedupKey
      ? 'ON CONFLICT (dedup_key) DO NOTHING'
      : '';
    const result = await this.db.query(
      `INSERT INTO notifications
         (type, title, body, entity_type, entity_id, action_href,
          audience_role, audience_user, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ${conflict}
       RETURNING ${COLUMNS}`,
      params,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async markRead(caller: Caller, id: number): Promise<Notification> {
    const visible = this.visibility(caller, []);
    visible.params.push(id);
    const result = await this.db.query(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, now())
        WHERE id = $${visible.params.length} AND ${visible.clause}
        RETURNING ${COLUMNS}`,
      visible.params,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new NotFoundException(`Không tìm thấy notification #${id}.`);
    }
    return mapRow(row);
  }

  async markAllRead(caller: Caller): Promise<{ updated: number }> {
    const visible = this.visibility(caller, []);
    const result = await this.db.query(
      `UPDATE notifications
          SET read_at = now()
        WHERE read_at IS NULL AND ${visible.clause}`,
      visible.params,
    );
    return { updated: result.rowCount ?? 0 };
  }
}
