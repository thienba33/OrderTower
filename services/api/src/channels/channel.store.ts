// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type { Channel, ChannelStatus, ChannelStore } from './channel.types';

export const CHANNEL_STORE = 'CHANNEL_STORE';

function copyChannel(channel: Channel): Channel {
  return JSON.parse(JSON.stringify(channel)) as Channel;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapChannelRow(row: Record<string, unknown>): Channel {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    status: row.status as ChannelStatus,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const CHANNEL_COLUMNS = `id, name, description, status, created_at, updated_at`;

// Lưu kênh bán trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryChannelStore implements ChannelStore {
  private readonly channels = new Map<string, Channel>();

  async save(channel: Channel): Promise<void> {
    this.channels.set(channel.id, copyChannel(channel));
  }

  async findById(id: string): Promise<Channel | null> {
    const found = this.channels.get(id);
    return found ? copyChannel(found) : null;
  }

  async findByName(name: string): Promise<Channel | null> {
    const found = [...this.channels.values()].find(
      (channel) => channel.name === name,
    );
    return found ? copyChannel(found) : null;
  }

  async list(): Promise<Channel[]> {
    return [...this.channels.values()].map(copyChannel);
  }
}

// Lưu kênh bán vào Postgres. save() là upsert 1 hàng theo id; tên kênh
// duy nhất được giữ bằng ràng buộc UNIQUE trên cột name (xem migration
// 006) và service kiểm tra trùng trước khi tạo để báo lỗi rõ ràng.
export class PostgresChannelStore implements ChannelStore {
  constructor(private readonly db: Queryable) {}

  async save(channel: Channel): Promise<void> {
    await this.db.query(
      `INSERT INTO channels
         (id, name, description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        channel.id,
        channel.name,
        channel.description,
        channel.status,
        channel.createdAt,
        channel.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Channel | null> {
    const found = await this.db.query(
      `SELECT ${CHANNEL_COLUMNS} FROM channels WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapChannelRow(found.rows[0] as Record<string, unknown>);
  }

  async findByName(name: string): Promise<Channel | null> {
    const found = await this.db.query(
      `SELECT ${CHANNEL_COLUMNS} FROM channels WHERE name = $1`,
      [name],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapChannelRow(found.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<Channel[]> {
    const found = await this.db.query(
      `SELECT ${CHANNEL_COLUMNS} FROM channels ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapChannelRow);
  }
}
