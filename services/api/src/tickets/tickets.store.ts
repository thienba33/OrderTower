// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type {
  Ticket,
  TicketChannel,
  TicketStatus,
  TicketStore,
  TicketType,
} from './tickets.types';

export const TICKET_STORE = 'TICKET_STORE';

function copyTicket(ticket: Ticket): Ticket {
  return JSON.parse(JSON.stringify(ticket)) as Ticket;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toNullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

function mapTicketRow(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as string,
    customer: row.customer as string,
    orderId: row.order_id as string,
    type: row.type as TicketType,
    channel: row.channel as TicketChannel,
    content: row.content as string,
    status: row.status as TicketStatus,
    handler: row.handler as string,
    needsCall: row.needs_call as boolean,
    createdBy: row.created_by as string,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    closedAt: toNullableIso(row.closed_at),
  };
}

const TICKET_COLUMNS = `id, customer, order_id, type, channel, content, status, handler, needs_call, created_by, created_at, updated_at, closed_at`;

// Lưu ticket trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryTicketStore implements TicketStore {
  private readonly tickets = new Map<string, Ticket>();

  async save(ticket: Ticket): Promise<void> {
    this.tickets.set(ticket.id, copyTicket(ticket));
  }

  async findById(id: string): Promise<Ticket | null> {
    const found = this.tickets.get(id);
    return found ? copyTicket(found) : null;
  }

  async list(): Promise<Ticket[]> {
    return [...this.tickets.values()].map(copyTicket);
  }
}

// Lưu ticket vào Postgres. save() là upsert 1 hàng theo id; mã đơn là
// chuỗi tự do, không có khóa ngoại tới bảng orders (xem tickets.types.ts).
export class PostgresTicketStore implements TicketStore {
  constructor(private readonly db: Queryable) {}

  async save(ticket: Ticket): Promise<void> {
    await this.db.query(
      `INSERT INTO tickets
         (id, customer, order_id, type, channel, content, status, handler, needs_call, created_by, created_at, updated_at, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         customer = EXCLUDED.customer,
         order_id = EXCLUDED.order_id,
         type = EXCLUDED.type,
         channel = EXCLUDED.channel,
         content = EXCLUDED.content,
         status = EXCLUDED.status,
         handler = EXCLUDED.handler,
         needs_call = EXCLUDED.needs_call,
         created_by = EXCLUDED.created_by,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at,
         closed_at = EXCLUDED.closed_at`,
      [
        ticket.id,
        ticket.customer,
        ticket.orderId,
        ticket.type,
        ticket.channel,
        ticket.content,
        ticket.status,
        ticket.handler,
        ticket.needsCall,
        ticket.createdBy,
        ticket.createdAt,
        ticket.updatedAt,
        ticket.closedAt,
      ],
    );
  }

  async findById(id: string): Promise<Ticket | null> {
    const found = await this.db.query(
      `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapTicketRow(found.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<Ticket[]> {
    const found = await this.db.query(
      `SELECT ${TICKET_COLUMNS} FROM tickets ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapTicketRow);
  }
}
