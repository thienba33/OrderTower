// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable, Transactional } from '../db/db.types';
import type {
  Shipment,
  ShipmentHistoryEntry,
  ShipmentStatus,
  ShipmentStore,
} from './shipment.types';

export const SHIPMENT_STORE = 'SHIPMENT_STORE';

function copyShipment(shipment: Shipment): Shipment {
  return JSON.parse(JSON.stringify(shipment)) as Shipment;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapHistoryRow(row: Record<string, unknown>): ShipmentHistoryEntry {
  return {
    from: (row.from_state as string | null) ?? null,
    to: row.to_state as string,
    by: row.actor as string,
    role: row.role as string,
    at: toIso(row.created_at),
    ...(row.reason ? { reason: row.reason as string } : {}),
  };
}

function mapShipmentRow(
  row: Record<string, unknown>,
  historyRows: Array<Record<string, unknown>>,
): Shipment {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    status: row.status as ShipmentStatus,
    driverId: (row.driver_id as string | null) ?? null,
    vehicleId: (row.vehicle_id as string | null) ?? null,
    proofPhotoKey: (row.proof_photo_key as string | null) ?? null,
    history: historyRows.map(mapHistoryRow),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const SHIPMENT_COLUMNS = `id, order_id, status, driver_id, vehicle_id,
  proof_photo_key, created_at, updated_at`;

const HISTORY_COLUMNS = `from_state, to_state, actor, role, reason,
  created_at`;

// Lưu shipment trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryShipmentStore implements ShipmentStore {
  private readonly shipments = new Map<string, Shipment>();

  async save(shipment: Shipment): Promise<void> {
    this.shipments.set(shipment.id, copyShipment(shipment));
  }

  async findById(id: string): Promise<Shipment | null> {
    const found = this.shipments.get(id);
    return found ? copyShipment(found) : null;
  }

  async findByOrderId(orderId: string): Promise<Shipment[]> {
    return [...this.shipments.values()]
      .filter((shipment) => shipment.orderId === orderId)
      .map(copyShipment);
  }

  async list(): Promise<Shipment[]> {
    return [...this.shipments.values()].map(copyShipment);
  }
}

// Lưu shipment vào Postgres. save() ghi đè toàn bộ 1 shipment cùng lịch sử
// của nó trong 1 giao dịch (upsert hàng shipment, xóa rồi chèn lại lịch sử),
// nên service luôn thấy 1 ảnh chụp nhất quán.
export class PostgresShipmentStore implements ShipmentStore {
  constructor(private readonly db: Transactional) {}

  async save(shipment: Shipment): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO shipments
           (id, order_id, status, driver_id, vehicle_id, proof_photo_key,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           order_id = EXCLUDED.order_id,
           status = EXCLUDED.status,
           driver_id = EXCLUDED.driver_id,
           vehicle_id = EXCLUDED.vehicle_id,
           proof_photo_key = EXCLUDED.proof_photo_key,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
        [
          shipment.id,
          shipment.orderId,
          shipment.status,
          shipment.driverId,
          shipment.vehicleId,
          shipment.proofPhotoKey,
          shipment.createdAt,
          shipment.updatedAt,
        ],
      );
      await client.query(
        'DELETE FROM shipment_history WHERE shipment_id = $1',
        [shipment.id],
      );
      for (const entry of shipment.history) {
        await client.query(
          `INSERT INTO shipment_history
             (shipment_id, from_state, to_state, actor, role, reason,
              created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            shipment.id,
            entry.from,
            entry.to,
            entry.by,
            entry.role,
            entry.reason ?? null,
            entry.at,
          ],
        );
      }
    });
  }

  async findById(id: string): Promise<Shipment | null> {
    return this.loadById(this.db, id);
  }

  async findByOrderId(orderId: string): Promise<Shipment[]> {
    const found = await this.db.query(
      `SELECT ${SHIPMENT_COLUMNS} FROM shipments
        WHERE order_id = $1 ORDER BY id`,
      [orderId],
    );
    const rows = found.rows as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      return [];
    }
    const history = await this.db.query(
      `SELECT shipment_id, ${HISTORY_COLUMNS} FROM shipment_history
        WHERE shipment_id IN (${rows.map((_, index) => `$${index + 1}`).join(', ')})
        ORDER BY id`,
      rows.map((row) => row.id),
    );
    const byShipment = new Map<string, Array<Record<string, unknown>>>();
    for (const row of history.rows as Array<Record<string, unknown>>) {
      const list = byShipment.get(row.shipment_id as string) ?? [];
      list.push(row);
      byShipment.set(row.shipment_id as string, list);
    }
    return rows.map((row) =>
      mapShipmentRow(row, byShipment.get(row.id as string) ?? []),
    );
  }

  async list(): Promise<Shipment[]> {
    const found = await this.db.query(
      `SELECT ${SHIPMENT_COLUMNS} FROM shipments ORDER BY id`,
    );
    const history = await this.db.query(
      `SELECT shipment_id, ${HISTORY_COLUMNS}
         FROM shipment_history ORDER BY id`,
    );
    const byShipment = new Map<string, Array<Record<string, unknown>>>();
    for (const row of history.rows as Array<Record<string, unknown>>) {
      const list = byShipment.get(row.shipment_id as string) ?? [];
      list.push(row);
      byShipment.set(row.shipment_id as string, list);
    }
    return (found.rows as Array<Record<string, unknown>>).map((row) =>
      mapShipmentRow(row, byShipment.get(row.id as string) ?? []),
    );
  }

  private async loadById(
    db: Queryable,
    id: string,
  ): Promise<Shipment | null> {
    const found = await db.query(
      `SELECT ${SHIPMENT_COLUMNS} FROM shipments WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    const history = await db.query(
      `SELECT ${HISTORY_COLUMNS} FROM shipment_history
        WHERE shipment_id = $1 ORDER BY id`,
      [id],
    );
    return mapShipmentRow(
      found.rows[0] as Record<string, unknown>,
      history.rows as Array<Record<string, unknown>>,
    );
  }
}
