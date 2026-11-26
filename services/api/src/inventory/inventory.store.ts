// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { InventoryItem } from './inventory.types';
import type { Queryable, Transactional } from '../db/db.types';

export const INVENTORY_STORE = 'INVENTORY_STORE';

// Lối ra vào kho tồn kho theo SKU. Bản bộ nhớ dùng cho kiểm thử đơn vị;
// bản Postgres là kho mặc định khi chạy thật.
export interface InventoryStore {
  list(): Promise<InventoryItem[]>;
  // client/forUpdate dùng khi giữ hàng trong transaction của đơn; khóa hàng
  // tồn kho để hai đơn đồng thời không cùng thấy đủ hàng.
  get(
    sku: string,
    client?: Queryable,
    forUpdate?: boolean,
  ): Promise<InventoryItem | null>;
  save(item: InventoryItem, client?: Queryable): Promise<void>;
}

function copyItem(item: InventoryItem): InventoryItem {
  return { ...item };
}

function mapInventoryRow(row: Record<string, unknown>): InventoryItem {
  return {
    sku: row.sku as string,
    name: row.name as string,
    unit: row.unit as string,
    // Cột unit_price thêm ở migration 009; hàng nạp trước đó về null.
    unitPrice: (row.unit_price as number | null) ?? null,
    stock: row.stock as number,
    reserved: row.reserved as number,
  };
}

const INVENTORY_COLUMNS = 'sku, name, unit, unit_price, stock, reserved, updated_at';

// Lưu tồn kho trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryInventoryStore implements InventoryStore {
  private readonly items = new Map<string, InventoryItem>();

  async list(): Promise<InventoryItem[]> {
    return [...this.items.values()].map(copyItem);
  }

  async get(
    sku: string,
    _client?: Queryable,
    _forUpdate?: boolean,
  ): Promise<InventoryItem | null> {
    const item = this.items.get(sku);
    return item ? copyItem(item) : null;
  }

  async save(item: InventoryItem, _client?: Queryable): Promise<void> {
    this.items.set(item.sku, copyItem(item));
  }
}

// Lưu tồn kho vào Postgres. Mỗi SKU là 1 hàng, save() upsert 1 hàng.
export class PostgresInventoryStore implements InventoryStore {
  constructor(private readonly db: Transactional) {}

  async list(): Promise<InventoryItem[]> {
    const found = await this.db.query(
      `SELECT ${INVENTORY_COLUMNS} FROM inventory ORDER BY sku`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(
      mapInventoryRow,
    );
  }

  async get(
    sku: string,
    client?: Queryable,
    forUpdate = false,
  ): Promise<InventoryItem | null> {
    const runner = client ?? this.db;
    const found = await runner.query(
      `SELECT ${INVENTORY_COLUMNS} FROM inventory WHERE sku = $1${
        forUpdate ? ' FOR UPDATE' : ''
      }`,
      [sku],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapInventoryRow(found.rows[0] as Record<string, unknown>);
  }

  async save(item: InventoryItem, client?: Queryable): Promise<void> {
    const runner = client ?? this.db;
    await runner.query(
      `INSERT INTO inventory (sku, name, unit, unit_price, stock, reserved)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name,
         unit = EXCLUDED.unit,
         unit_price = EXCLUDED.unit_price,
         stock = EXCLUDED.stock,
         reserved = EXCLUDED.reserved,
         updated_at = now()`,
      [item.sku, item.name, item.unit, item.unitPrice, item.stock, item.reserved],
    );
  }
}
