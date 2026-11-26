// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { AddressLevel } from '../address/address.types';
import type { Queryable, Transactional } from '../db/db.types';
import type { Order, OrderHistoryEntry, OrderStore } from './orders.types';

export const ORDER_STORE = 'ORDER_STORE';

function copyOrder(order: Order): Order {
  return JSON.parse(JSON.stringify(order)) as Order;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseJson<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}

function mapHistoryRow(row: Record<string, unknown>): OrderHistoryEntry {
  return {
    from: (row.from_state as string | null) ?? null,
    to: row.to_state as string,
    by: row.actor as string,
    role: row.role as string,
    at: toIso(row.created_at),
    ...(row.reason ? { reason: row.reason as string } : {}),
    ...(row.handling ? { handling: row.handling as string } : {}),
  };
}

function mapOrderRow(
  row: Record<string, unknown>,
  historyRows: Array<Record<string, unknown>>,
): Order {
  return {
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    customer: row.customer as string,
    // SĐT liên hệ giao hàng, null khi đơn không ghi (cột nullable, đơn cũ
    // tạo trước migration 009 cũng về null).
    phone: (row.phone as string | null) ?? null,
    items: parseJson(row.items),
    // Tổng tiền do server tính (VND), cột NOT NULL DEFAULT 0 nên đơn cũ
    // tạo trước migration 009 về 0.
    total: row.total as number,
    // Mốc giao hẹn dạng ISO-8601, null khi đơn không ghi.
    deadline: row.deadline ? toIso(row.deadline) : null,
    // Kênh nguồn đơn, null khi đơn không ghi kênh (cột nullable, đơn cũ
    // tạo trước migration 006 cũng về null).
    channelId: (row.channel_id as string | null) ?? null,
    // Khách hàng nhận đơn, null khi đơn không ghi khách (cột nullable,
    // đơn cũ tạo trước migration 008 cũng về null).
    customerId: (row.customer_id as string | null) ?? null,
    // AddressInput là object có các trường chuỗi tùy chọn; không có địa chỉ
    // thì đơn không mang khóa address, giống bản sao JSON của đơn trong bộ nhớ.
    ...(row.address ? { address: parseJson(row.address) } : {}),
    addressTrust: (row.address_trust as number | null) ?? null,
    addressLevel: (row.address_level as AddressLevel | null) ?? null,
    // Mọi lần tạo đơn đều gán workflowInstanceId, nên cột này thực tế
    // không bao giờ null dù migration để nullable.
    workflowInstanceId: row.workflow_instance_id as string,
    state: row.state as string,
    history: historyRows.map(mapHistoryRow),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const ORDER_COLUMNS = `id, idempotency_key, customer, phone, items, total,
  deadline, state, address, address_trust, address_level,
  workflow_instance_id, channel_id, customer_id, created_at, updated_at`;

const ORDER_HISTORY_COLUMNS = `from_state, to_state, actor, role, reason,
  handling, created_at`;

// Lưu đơn trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, Order>();

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, copyOrder(order));
  }

  async findById(id: string): Promise<Order | null> {
    const found = this.orders.get(id);
    return found ? copyOrder(found) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    for (const order of this.orders.values()) {
      if (order.idempotencyKey === key) {
        return copyOrder(order);
      }
    }
    return null;
  }

  async list(): Promise<Order[]> {
    return [...this.orders.values()].map(copyOrder);
  }
}

// Lưu đơn vào Postgres. save() ghi đè toàn bộ 1 đơn cùng lịch sử của nó
// trong 1 giao dịch (upsert hàng đơn, xóa rồi chèn lại lịch sử), nên service
// luôn thấy 1 ảnh chụp nhất quán.
export class PostgresOrderStore implements OrderStore {
  constructor(private readonly db: Transactional) {}

  async save(order: Order): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO orders
           (id, idempotency_key, customer, phone, items, total, deadline,
            state, address, address_trust, address_level,
            workflow_instance_id, channel_id, customer_id, created_at,
            updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO UPDATE SET
           idempotency_key = EXCLUDED.idempotency_key,
           customer = EXCLUDED.customer,
           phone = EXCLUDED.phone,
           items = EXCLUDED.items,
           total = EXCLUDED.total,
           deadline = EXCLUDED.deadline,
           state = EXCLUDED.state,
           address = EXCLUDED.address,
           address_trust = EXCLUDED.address_trust,
           address_level = EXCLUDED.address_level,
           workflow_instance_id = EXCLUDED.workflow_instance_id,
           channel_id = EXCLUDED.channel_id,
           customer_id = EXCLUDED.customer_id,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
        [
          order.id,
          order.idempotencyKey,
          order.customer,
          order.phone,
          // JSONB nhận chuỗi JSON: truyền mảng/object trực tiếp thì pg-mem
          // hiểu nhầm mảng thành mảng Postgres và làm mất vỏ mảng.
          JSON.stringify(order.items),
          order.total,
          order.deadline,
          order.state,
          order.address ? JSON.stringify(order.address) : null,
          order.addressTrust,
          order.addressLevel,
          order.workflowInstanceId,
          order.channelId,
          order.customerId,
          order.createdAt,
          order.updatedAt,
        ],
      );
      await client.query('DELETE FROM order_history WHERE order_id = $1', [
        order.id,
      ]);
      for (const entry of order.history) {
        await client.query(
          `INSERT INTO order_history
             (order_id, from_state, to_state, actor, role, reason, handling,
              created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            order.id,
            entry.from,
            entry.to,
            entry.by,
            entry.role,
            entry.reason ?? null,
            entry.handling ?? null,
            entry.at,
          ],
        );
      }
    });
  }

  async findById(id: string): Promise<Order | null> {
    return this.loadById(this.db, id);
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const found = await this.db.query(
      `SELECT ${ORDER_COLUMNS} FROM orders WHERE idempotency_key = $1`,
      [key],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return this.loadById(
      this.db,
      (found.rows[0] as Record<string, unknown>).id as string,
    );
  }

  async list(): Promise<Order[]> {
    const found = await this.db.query(
      `SELECT ${ORDER_COLUMNS} FROM orders ORDER BY id`,
    );
    const history = await this.db.query(
      `SELECT order_id, ${ORDER_HISTORY_COLUMNS}
         FROM order_history ORDER BY id`,
    );
    const byOrder = new Map<string, Array<Record<string, unknown>>>();
    for (const row of history.rows as Array<Record<string, unknown>>) {
      const list = byOrder.get(row.order_id as string) ?? [];
      list.push(row);
      byOrder.set(row.order_id as string, list);
    }
    return (found.rows as Array<Record<string, unknown>>).map((row) =>
      mapOrderRow(row, byOrder.get(row.id as string) ?? []),
    );
  }

  private async loadById(
    db: Queryable,
    id: string,
  ): Promise<Order | null> {
    const found = await db.query(
      `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    const history = await db.query(
      `SELECT ${ORDER_HISTORY_COLUMNS} FROM order_history
        WHERE order_id = $1 ORDER BY id`,
      [id],
    );
    return mapOrderRow(
      found.rows[0] as Record<string, unknown>,
      history.rows as Array<Record<string, unknown>>,
    );
  }
}
