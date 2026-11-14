// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type { Vehicle, VehicleStatus, VehicleStore } from './vehicle.types';

export const VEHICLE_STORE = 'VEHICLE_STORE';

function copyVehicle(vehicle: Vehicle): Vehicle {
  return JSON.parse(JSON.stringify(vehicle)) as Vehicle;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapVehicleRow(row: Record<string, unknown>): Vehicle {
  return {
    id: row.id as string,
    plate: row.plate as string,
    type: row.type as string,
    status: row.status as VehicleStatus,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const VEHICLE_COLUMNS = `id, plate, type, status, created_at, updated_at`;

// Lưu xe trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryVehicleStore implements VehicleStore {
  private readonly vehicles = new Map<string, Vehicle>();

  async save(vehicle: Vehicle): Promise<void> {
    this.vehicles.set(vehicle.id, copyVehicle(vehicle));
  }

  async findById(id: string): Promise<Vehicle | null> {
    const found = this.vehicles.get(id);
    return found ? copyVehicle(found) : null;
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const found = [...this.vehicles.values()].find(
      (vehicle) => vehicle.plate === plate,
    );
    return found ? copyVehicle(found) : null;
  }

  async list(): Promise<Vehicle[]> {
    return [...this.vehicles.values()].map(copyVehicle);
  }
}

// Lưu xe vào Postgres. save() là upsert 1 hàng theo id; biển số duy nhất
// được giữ bằng ràng buộc UNIQUE trên cột plate (xem migration 003) và
// service kiểm tra trùng trước khi tạo để báo lỗi rõ ràng.
export class PostgresVehicleStore implements VehicleStore {
  constructor(private readonly db: Queryable) {}

  async save(vehicle: Vehicle): Promise<void> {
    await this.db.query(
      `INSERT INTO vehicles
         (id, plate, type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         plate = EXCLUDED.plate,
         type = EXCLUDED.type,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        vehicle.id,
        vehicle.plate,
        vehicle.type,
        vehicle.status,
        vehicle.createdAt,
        vehicle.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Vehicle | null> {
    const found = await this.db.query(
      `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapVehicleRow(found.rows[0] as Record<string, unknown>);
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const found = await this.db.query(
      `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE plate = $1`,
      [plate],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapVehicleRow(found.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<Vehicle[]> {
    const found = await this.db.query(
      `SELECT ${VEHICLE_COLUMNS} FROM vehicles ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapVehicleRow);
  }
}
