// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type {
  RestrictedFlag,
  RestrictedFlagSource,
  RestrictedFlagStatus,
  RestrictedFlagStore,
} from './restricted-flag.types';

export const RESTRICTED_FLAG_STORE = 'RESTRICTED_FLAG_STORE';

function copyFlag(flag: RestrictedFlag): RestrictedFlag {
  return JSON.parse(JSON.stringify(flag)) as RestrictedFlag;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toNullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

function mapFlagRow(row: Record<string, unknown>): RestrictedFlag {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    customerId: row.customer_id as string | null,
    customerPhone: row.customer_phone as string | null,
    status: row.status as RestrictedFlagStatus,
    source: row.source as RestrictedFlagSource,
    reason: row.reason as string | null,
    createdBy: row.created_by as string,
    decidedBy: row.decided_by as string | null,
    decidedAt: toNullableIso(row.decided_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const FLAG_COLUMNS = `id, order_id, customer_id, customer_phone, status, source, reason, created_by, decided_by, decided_at, created_at, updated_at`;

// Lưu cờ hạn chế trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryRestrictedFlagStore implements RestrictedFlagStore {
  private readonly flags = new Map<string, RestrictedFlag>();

  async save(flag: RestrictedFlag): Promise<void> {
    this.flags.set(flag.id, copyFlag(flag));
  }

  async findById(id: string): Promise<RestrictedFlag | null> {
    const found = this.flags.get(id);
    return found ? copyFlag(found) : null;
  }

  async findByOrderId(orderId: string): Promise<RestrictedFlag[]> {
    return [...this.flags.values()]
      .filter((flag) => flag.orderId === orderId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copyFlag);
  }

  async list(): Promise<RestrictedFlag[]> {
    return [...this.flags.values()].map(copyFlag);
  }
}

// Lưu cờ hạn chế vào Postgres. save() là upsert 1 hàng theo id; đơn có
// tối đa 1 cờ đang hoạt động được giữ bằng kiểm tra ở service (xem
// RestrictedFlagsService), không bằng ràng buộc DB.
export class PostgresRestrictedFlagStore implements RestrictedFlagStore {
  constructor(private readonly db: Queryable) {}

  async save(flag: RestrictedFlag): Promise<void> {
    await this.db.query(
      `INSERT INTO restricted_flags
         (id, order_id, customer_id, customer_phone, status, source, reason, created_by, decided_by, decided_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         customer_id = EXCLUDED.customer_id,
         customer_phone = EXCLUDED.customer_phone,
         status = EXCLUDED.status,
         source = EXCLUDED.source,
         reason = EXCLUDED.reason,
         created_by = EXCLUDED.created_by,
         decided_by = EXCLUDED.decided_by,
         decided_at = EXCLUDED.decided_at,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        flag.id,
        flag.orderId,
        flag.customerId,
        flag.customerPhone,
        flag.status,
        flag.source,
        flag.reason,
        flag.createdBy,
        flag.decidedBy,
        flag.decidedAt,
        flag.createdAt,
        flag.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<RestrictedFlag | null> {
    const found = await this.db.query(
      `SELECT ${FLAG_COLUMNS} FROM restricted_flags WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapFlagRow(found.rows[0] as Record<string, unknown>);
  }

  async findByOrderId(orderId: string): Promise<RestrictedFlag[]> {
    const found = await this.db.query(
      `SELECT ${FLAG_COLUMNS} FROM restricted_flags WHERE order_id = $1 ORDER BY id`,
      [orderId],
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapFlagRow);
  }

  async list(): Promise<RestrictedFlag[]> {
    const found = await this.db.query(
      `SELECT ${FLAG_COLUMNS} FROM restricted_flags ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapFlagRow);
  }
}
