// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable, Transactional } from '../db/db.types';
import type {
  DeliveryEvent,
  DeliveryEventStore,
  DeliveryEventType,
} from './delivery-event.types';

export const DELIVERY_EVENT_STORE = 'DELIVERY_EVENT_STORE';

function copyEvent(event: DeliveryEvent): DeliveryEvent {
  return JSON.parse(JSON.stringify(event)) as DeliveryEvent;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapEventRow(row: Record<string, unknown>): DeliveryEvent {
  return {
    id: row.id as string,
    shipmentId: row.shipment_id as string,
    orderId: row.order_id as string,
    type: row.type as DeliveryEventType,
    note: (row.note as string | null) ?? null,
    proofPhotoKey: (row.proof_photo_key as string | null) ?? null,
    by: row.actor as string,
    role: row.role as string,
    at: toIso(row.at),
    createdAt: toIso(row.created_at),
  };
}

const EVENT_COLUMNS = `id, shipment_id, order_id, type, note,
  proof_photo_key, actor, role, at, created_at`;

// Lưu sự kiện trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryDeliveryEventStore implements DeliveryEventStore {
  private readonly events = new Map<string, DeliveryEvent>();

  async save(event: DeliveryEvent): Promise<void> {
    this.events.set(event.id, copyEvent(event));
  }

  async findById(id: string): Promise<DeliveryEvent | null> {
    const found = this.events.get(id);
    return found ? copyEvent(found) : null;
  }

  async findByShipmentId(shipmentId: string): Promise<DeliveryEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.shipmentId === shipmentId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copyEvent);
  }

  async list(): Promise<DeliveryEvent[]> {
    return [...this.events.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copyEvent);
  }
}

// Lưu sự kiện vào Postgres. Sự kiện chỉ ghi thêm nên save() chỉ chèn
// 1 hàng; ghi lại cùng id thì bỏ qua (ON CONFLICT DO NOTHING), không
// ghi đè sự kiện đã có.
export class PostgresDeliveryEventStore implements DeliveryEventStore {
  constructor(private readonly db: Transactional) {}

  async save(event: DeliveryEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO delivery_events
         (id, shipment_id, order_id, type, note, proof_photo_key, actor,
          role, at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.shipmentId,
        event.orderId,
        event.type,
        event.note,
        event.proofPhotoKey,
        event.by,
        event.role,
        event.at,
        event.createdAt,
        event.createdAt,
      ],
    );
  }

  async findById(id: string): Promise<DeliveryEvent | null> {
    return this.loadById(this.db, id);
  }

  async findByShipmentId(shipmentId: string): Promise<DeliveryEvent[]> {
    const found = await this.db.query(
      `SELECT ${EVENT_COLUMNS} FROM delivery_events
        WHERE shipment_id = $1 ORDER BY id`,
      [shipmentId],
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapEventRow);
  }

  async list(): Promise<DeliveryEvent[]> {
    const found = await this.db.query(
      `SELECT ${EVENT_COLUMNS} FROM delivery_events ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapEventRow);
  }

  private async loadById(
    db: Queryable,
    id: string,
  ): Promise<DeliveryEvent | null> {
    const found = await db.query(
      `SELECT ${EVENT_COLUMNS} FROM delivery_events WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapEventRow(found.rows[0] as Record<string, unknown>);
  }
}
