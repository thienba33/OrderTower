// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable, Transactional } from '../db/db.types';
import type {
  NewOutboxEvent,
  OutboxEvent,
  OutboxFailureOutcome,
  OutboxFilters,
  OutboxStatus,
} from './outbox.types';

export const OUTBOX_STORE = 'OUTBOX_STORE';

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_BASE_SECONDS = 30;

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
    maxAttempts: Number(row.max_attempts ?? DEFAULT_MAX_ATTEMPTS),
    nextAttemptAt:
      row.next_attempt_at === null || row.next_attempt_at === undefined
        ? null
        : toIso(row.next_attempt_at),
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
  findById(id: number): Promise<OutboxEvent | null>;
  list(filters: OutboxFilters): Promise<OutboxEvent[]>;
  // Chỉ event pending đã đến hạn retry; dùng cho job relay.
  listDuePending(limit: number): Promise<OutboxEvent[]>;
  markProcessed(id: number): Promise<boolean>;
  markFailed(id: number, error: string): Promise<OutboxFailureOutcome>;
  requeue(id: number): Promise<boolean>;
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
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      processedAt: null,
      lastError: null,
    };
    this.events.set(event.id, event);
    return { ...event, payload: { ...event.payload } };
  }

  async findById(id: number): Promise<OutboxEvent | null> {
    const event = this.events.get(id);
    return event ? { ...event, payload: { ...event.payload } } : null;
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

  async listDuePending(limit: number): Promise<OutboxEvent[]> {
    const now = Date.now();
    return [...this.events.values()]
      .filter(
        (event) =>
          event.status === 'pending' &&
          (event.nextAttemptAt === null ||
            Date.parse(event.nextAttemptAt) <= now),
      )
      .sort((a, b) => a.id - b.id)
      .slice(0, limit)
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
    event.nextAttemptAt = null;
    event.lastError = null;
    return true;
  }

  async markFailed(
    id: number,
    error: string,
  ): Promise<OutboxFailureOutcome> {
    const event = this.events.get(id);
    if (!event) {
      return 'dead-letter';
    }
    event.attempts += 1;
    event.lastError = error;
    if (event.attempts >= event.maxAttempts) {
      event.status = 'failed';
      event.nextAttemptAt = null;
      return 'dead-letter';
    }
    event.status = 'pending';
    event.nextAttemptAt = new Date(
      Date.now() + RETRY_BASE_SECONDS * event.attempts * 1000,
    ).toISOString();
    return 'retry';
  }

  async requeue(id: number): Promise<boolean> {
    const event = this.events.get(id);
    if (!event || event.status !== 'failed') {
      return false;
    }
    event.status = 'pending';
    event.attempts = 0;
    event.nextAttemptAt = null;
    event.processedAt = null;
    event.lastError = null;
    return true;
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
                 status, attempts, max_attempts, next_attempt_at,
                 created_at, processed_at, last_error`,
      [
        input.type,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
      ],
    );
    return mapEventRow(result.rows[0] as Record<string, unknown>);
  }

  async findById(id: number): Promise<OutboxEvent | null> {
    const result = await this.db.query(
      `SELECT id, event_type, aggregate_type, aggregate_id, payload, status,
              attempts, max_attempts, next_attempt_at, created_at,
              processed_at, last_error
         FROM outbox_events
        WHERE id = $1`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapEventRow(row) : null;
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
              attempts, max_attempts, next_attempt_at, created_at,
              processed_at, last_error
         FROM outbox_events
         ${where}
        ORDER BY id
        LIMIT $${params.length}`,
      params,
    );
    return (result.rows as Array<Record<string, unknown>>).map(mapEventRow);
  }

  async listDuePending(limit: number): Promise<OutboxEvent[]> {
    const result = await this.db.query(
      `SELECT id, event_type, aggregate_type, aggregate_id, payload, status,
              attempts, max_attempts, next_attempt_at, created_at,
              processed_at, last_error
         FROM outbox_events
        WHERE status = 'pending'
          AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        ORDER BY id
        LIMIT $1`,
      [limit],
    );
    return (result.rows as Array<Record<string, unknown>>).map(mapEventRow);
  }

  async markProcessed(id: number): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE outbox_events
          SET status = 'processed', attempts = attempts + 1,
              processed_at = now(), next_attempt_at = NULL, last_error = NULL
        WHERE id = $1 AND status = 'pending'`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(
    id: number,
    error: string,
  ): Promise<OutboxFailureOutcome> {
    const result = await this.db.query(
      `UPDATE outbox_events
          SET attempts = attempts + 1,
              last_error = $2,
              status = CASE
                WHEN attempts + 1 >= max_attempts THEN 'failed'
                ELSE 'pending'
              END,
              next_attempt_at = CASE
                WHEN attempts + 1 >= max_attempts THEN NULL
                ELSE now() + make_interval(secs => ${RETRY_BASE_SECONDS} * (attempts + 1))
              END
        WHERE id = $1 AND status = 'pending'
        RETURNING status`,
      [id, error],
    );
    const status = (result.rows[0] as { status?: string } | undefined)?.status;
    return status === 'pending' ? 'retry' : 'dead-letter';
  }

  async requeue(id: number): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE outbox_events
          SET status = 'pending', attempts = 0, next_attempt_at = NULL,
              processed_at = NULL, last_error = NULL
        WHERE id = $1 AND status = 'failed'`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
