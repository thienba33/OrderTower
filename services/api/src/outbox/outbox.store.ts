// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable, Transactional } from '../db/db.types';
import type {
  NewOutboxEvent,
  OutboxEvent,
  OutboxFilters,
  OutboxStatus,
} from './outbox.types';

export const OUTBOX_STORE = 'OUTBOX_STORE';

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>;
  }
  return (value ?? {}) as Record<string, unknown>;
}

function mapEventRow(row: Record<string, unknown>): OutboxEvent {
  return {
    id: Number(row.id),
    type: row.event_type as string,
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as string,
    payload: parsePayload(row.payload),
    status: row.status as OutboxStatus,
    attempts: Number(row.attempts ?? 0),
    createdAt: toIso(row.created_at),
    processedAt:
      row.processed_at === null || row.processed_at === undefined
        ? null
        : toIso(row.processed_at),
    lastError: (row.last_error as string | null) ?? null,
  };
}

export interface OutboxStore {
  append(input: NewOutboxEvent, client?: Queryable): Promise<OutboxEvent>;
  list(filters: OutboxFilters): Promise<OutboxEvent[]>;
  markProcessed(id: number): Promise<boolean>;
  markFailed(id: number, error: string): Promise<void>;
}

export class InMemoryOutboxStore implements OutboxStore {
  private nextId = 1;
  private readonly events = new Map<number, OutboxEvent>();

  async append(input: NewOutboxEvent): Promise<OutboxEvent> {
    const event: OutboxEvent = {
      id: this.nextId++,
      type: input.type,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: { ...input.payload },
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      processedAt: null,
      lastError: null,
    };
    this.events.set(event.id, event);
    return { ...event, payload: { ...event.payload } };
  }

  async list(filters: OutboxFilters): Promise<OutboxEvent[]> {
    return [...this.events.values()]
      .filter(
        (event) =>
          (filters.status === undefined || event.status === filters.status) &&
          (filters.type === undefined || event.type === filters.type),
      )
      .sort((a, b) => a.id - b.id)
      .slice(0, filters.limit ?? 100)
      .map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  async markProcessed(id: number): Promise<boolean> {
    const event = this.events.get(id);
    if (!event || event.status !== 'pending') {
      return false;
    }
    event.status = 'processed';
    event.attempts += 1;
    event.processedAt = new Date().toISOString();
    event.lastError = null;
    return true;
  }

  async markFailed(id: number, error: string): Promise<void> {
    const event = this.events.get(id);
    if (!event) {
      return;
    }
    event.status = 'failed';
    event.attempts += 1;
    event.lastError = error;
  }
}

export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly db: Transactional) {}

  async append(
    input: NewOutboxEvent,
    client?: Queryable,
  ): Promise<OutboxEvent> {
    const runner = client ?? this.db;
    const result = await runner.query(
      `INSERT INTO outbox_events
         (event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING id, event_type, aggregate_type, aggregate_id, payload,
                 status, attempts, created_at, processed_at, last_error`,
      [
        input.type,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
      ],
    );
    return mapEventRow(result.rows[0] as Record<string, unknown>);
  }

  async list(filters: OutboxFilters): Promise<OutboxEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.status !== undefined) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.type !== undefined) {
      params.push(filters.type);
      conditions.push(`event_type = $${params.length}`);
    }
    params.push(filters.limit ?? 100);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT id, event_type, aggregate_type, aggregate_id, payload, status,
              attempts, created_at, processed_at, last_error
         FROM outbox_events
         ${where}
        ORDER BY id
        LIMIT $${params.length}`,
      params,
    );
    return (result.rows as Array<Record<string, unknown>>).map(mapEventRow);
  }

  async markProcessed(id: number): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE outbox_events
          SET status = 'processed', attempts = attempts + 1,
              processed_at = now(), last_error = NULL
        WHERE id = $1 AND status = 'pending'`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(id: number, error: string): Promise<void> {
    await this.db.query(
      `UPDATE outbox_events
          SET status = 'failed', attempts = attempts + 1, last_error = $2
        WHERE id = $1 AND status = 'pending'`,
      [id, error],
    );
  }
}
