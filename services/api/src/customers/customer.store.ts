// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type { Customer, CustomerStore } from './customer.types';

export const CUSTOMER_STORE = 'CUSTOMER_STORE';

function copyCustomer(customer: Customer): Customer {
  return JSON.parse(JSON.stringify(customer)) as Customer;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapCustomerRow(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    address: (row.address as string | null) ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const CUSTOMER_COLUMNS = `id, name, phone, address, created_at, updated_at`;

// Lưu khách hàng trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryCustomerStore implements CustomerStore {
  private readonly customers = new Map<string, Customer>();

  async save(customer: Customer): Promise<void> {
    this.customers.set(customer.id, copyCustomer(customer));
  }

  async findById(id: string): Promise<Customer | null> {
    const found = this.customers.get(id);
    return found ? copyCustomer(found) : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const found = [...this.customers.values()].find(
      (customer) => customer.phone === phone,
    );
    return found ? copyCustomer(found) : null;
  }

  async list(): Promise<Customer[]> {
    return [...this.customers.values()].map(copyCustomer);
  }
}

// Lưu khách hàng vào Postgres. save() là upsert 1 hàng theo id; số điện
// thoại duy nhất được giữ bằng ràng buộc UNIQUE trên cột phone (xem
// migration 008) và service kiểm tra trùng trước khi tạo để báo lỗi rõ ràng.
export class PostgresCustomerStore implements CustomerStore {
  constructor(private readonly db: Queryable) {}

  async save(customer: Customer): Promise<void> {
    await this.db.query(
      `INSERT INTO customers
         (id, name, phone, address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        customer.id,
        customer.name,
        customer.phone,
        customer.address,
        customer.createdAt,
        customer.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Customer | null> {
    const found = await this.db.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapCustomerRow(found.rows[0] as Record<string, unknown>);
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const found = await this.db.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE phone = $1`,
      [phone],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapCustomerRow(found.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<Customer[]> {
    const found = await this.db.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapCustomerRow);
  }
}
