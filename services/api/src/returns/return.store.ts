// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type { Return, ReturnStatus, ReturnStore } from './return.types';

export const RETURN_STORE = 'RETURN_STORE';

function copyReturn(ret: Return): Return {
  return JSON.parse(JSON.stringify(ret)) as Return;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapReturnRow(row: Record<string, unknown>): Return {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    reason: row.reason as string,
    status: row.status as ReturnStatus,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const RETURN_COLUMNS = `id, order_id, reason, status, created_at, updated_at`;

// Lưu trả hàng trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryReturnStore implements ReturnStore {
  private readonly returns = new Map<string, Return>();

  async save(ret: Return): Promise<void> {
    this.returns.set(ret.id, copyReturn(ret));
  }

  async findById(id: string): Promise<Return | null> {
    const found = this.returns.get(id);
    return found ? copyReturn(found) : null;
  }

  async findByOrderId(orderId: string): Promise<Return[]> {
    return [...this.returns.values()]
      .filter((ret) => ret.orderId === orderId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copyReturn);
  }

  async list(): Promise<Return[]> {
    return [...this.returns.values()].map(copyReturn);
  }
}

// Lưu trả hàng vào Postgres. save() là upsert 1 hàng theo id; đơn có tối
// đa 1 trả hàng đang hoạt động được giữ bằng kiểm tra ở service (xem
// ReturnsService), không bằng ràng buộc DB.
export class PostgresReturnStore implements ReturnStore {
  constructor(private readonly db: Queryable) {}

  async save(ret: Return): Promise<void> {
    await this.db.query(
      `INSERT INTO returns
         (id, order_id, reason, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         reason = EXCLUDED.reason,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        ret.id,
        ret.orderId,
        ret.reason,
        ret.status,
        ret.createdAt,
        ret.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Return | null> {
    const found = await this.db.query(
      `SELECT ${RETURN_COLUMNS} FROM returns WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapReturnRow(found.rows[0] as Record<string, unknown>);
  }

  async findByOrderId(orderId: string): Promise<Return[]> {
    const found = await this.db.query(
      `SELECT ${RETURN_COLUMNS} FROM returns WHERE order_id = $1 ORDER BY id`,
      [orderId],
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapReturnRow);
  }

  async list(): Promise<Return[]> {
    const found = await this.db.query(
      `SELECT ${RETURN_COLUMNS} FROM returns ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapReturnRow);
  }
}
