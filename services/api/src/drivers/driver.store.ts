// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type { Driver, DriverStatus, DriverStore } from './driver.types';

export const DRIVER_STORE = 'DRIVER_STORE';

function copyDriver(driver: Driver): Driver {
  return JSON.parse(JSON.stringify(driver)) as Driver;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapDriverRow(row: Record<string, unknown>): Driver {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    username: row.username as string,
    vehicleId: (row.vehicle_id as string | null) ?? null,
    status: row.status as DriverStatus,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const DRIVER_COLUMNS = `id, name, phone, username, vehicle_id, status, created_at, updated_at`;

// Lưu tài xế trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryDriverStore implements DriverStore {
  private readonly drivers = new Map<string, Driver>();

  async save(driver: Driver): Promise<void> {
    this.drivers.set(driver.id, copyDriver(driver));
  }

  async findById(id: string): Promise<Driver | null> {
    const found = this.drivers.get(id);
    return found ? copyDriver(found) : null;
  }

  async findByUsername(username: string): Promise<Driver | null> {
    const found = [...this.drivers.values()].find(
      (driver) => driver.username === username,
    );
    return found ? copyDriver(found) : null;
  }

  async findByPhone(phone: string): Promise<Driver | null> {
    const found = [...this.drivers.values()].find(
      (driver) => driver.phone === phone,
    );
    return found ? copyDriver(found) : null;
  }

  async list(): Promise<Driver[]> {
    return [...this.drivers.values()].map(copyDriver);
  }
}

// Lưu tài xế vào Postgres. save() là upsert 1 hàng theo id; username và
// phone duy nhất được giữ bằng ràng buộc UNIQUE (xem migration 004) và
// service kiểm tra trùng trước khi tạo để báo lỗi rõ ràng.
export class PostgresDriverStore implements DriverStore {
  constructor(private readonly db: Queryable) {}

  async save(driver: Driver): Promise<void> {
    await this.db.query(
      `INSERT INTO drivers
         (id, name, phone, username, vehicle_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         username = EXCLUDED.username,
         vehicle_id = EXCLUDED.vehicle_id,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        driver.id,
        driver.name,
        driver.phone,
        driver.username,
        driver.vehicleId,
        driver.status,
        driver.createdAt,
        driver.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Driver | null> {
    const found = await this.db.query(
      `SELECT ${DRIVER_COLUMNS} FROM drivers WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapDriverRow(found.rows[0] as Record<string, unknown>);
  }

  async findByUsername(username: string): Promise<Driver | null> {
    const found = await this.db.query(
      `SELECT ${DRIVER_COLUMNS} FROM drivers WHERE username = $1`,
      [username],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapDriverRow(found.rows[0] as Record<string, unknown>);
  }

  async findByPhone(phone: string): Promise<Driver | null> {
    const found = await this.db.query(
      `SELECT ${DRIVER_COLUMNS} FROM drivers WHERE phone = $1`,
      [phone],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapDriverRow(found.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<Driver[]> {
    const found = await this.db.query(
      `SELECT ${DRIVER_COLUMNS} FROM drivers ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapDriverRow);
  }
}
