// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type {
  WorkflowInstance,
  WorkflowInstanceHistoryEntry,
  WorkflowInstanceStatus,
  WorkflowInstanceStore,
} from './instance.types';
import type { Queryable, Transactional } from '../db/db.types';

export const WORKFLOW_INSTANCE_STORE = 'WORKFLOW_INSTANCE_STORE';

function copyInstance(instance: WorkflowInstance): WorkflowInstance {
  return JSON.parse(JSON.stringify(instance)) as WorkflowInstance;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseContext(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>;
  }
  return (value ?? {}) as Record<string, unknown>;
}

function mapHistoryRow(row: Record<string, unknown>): WorkflowInstanceHistoryEntry {
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

function mapInstanceRow(
  row: Record<string, unknown>,
  historyRows: Array<Record<string, unknown>>,
): WorkflowInstance {
  return {
    id: row.id as string,
    definitionId: row.definition_id as string,
    definitionVersion: row.definition_version as string,
    businessKey: row.business_key as string,
    currentState: row.current_state as string,
    status: row.status as WorkflowInstanceStatus,
    context: parseContext(row.context),
    history: historyRows.map(mapHistoryRow),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const INSTANCE_COLUMNS = `id, definition_id, definition_version, business_key,
  current_state, status, context, created_at, updated_at`;

const HISTORY_COLUMNS = `from_state, to_state, actor, role, reason, handling,
  created_at`;

// Lưu instance trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryWorkflowInstanceStore implements WorkflowInstanceStore {
  private readonly instances = new Map<string, WorkflowInstance>();

  async save(instance: WorkflowInstance): Promise<void> {
    this.instances.set(instance.id, copyInstance(instance));
  }

  async findById(id: string): Promise<WorkflowInstance | null> {
    const found = this.instances.get(id);
    return found ? copyInstance(found) : null;
  }

  async findByBusinessKey(
    definitionId: string,
    businessKey: string,
  ): Promise<WorkflowInstance | null> {
    for (const instance of this.instances.values()) {
      if (
        instance.definitionId === definitionId &&
        instance.businessKey === businessKey
      ) {
        return copyInstance(instance);
      }
    }
    return null;
  }

  async list(): Promise<WorkflowInstance[]> {
    return [...this.instances.values()].map(copyInstance);
  }
}

// Lưu instance vào Postgres. save() ghi đè toàn bộ 1 instance cùng lịch sử
// của nó trong 1 giao dịch (upsert hàng instance, xóa rồi chèn lại lịch sử),
// nên service luôn thấy 1 ảnh chụp nhất quán.
export class PostgresWorkflowInstanceStore implements WorkflowInstanceStore {
  constructor(private readonly db: Transactional) {}

  async save(instance: WorkflowInstance): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO workflow_instances
           (id, definition_id, definition_version, business_key,
            current_state, status, context, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           definition_id = EXCLUDED.definition_id,
           definition_version = EXCLUDED.definition_version,
           business_key = EXCLUDED.business_key,
           current_state = EXCLUDED.current_state,
           status = EXCLUDED.status,
           context = EXCLUDED.context,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
        [
          instance.id,
          instance.definitionId,
          instance.definitionVersion,
          instance.businessKey,
          instance.currentState,
          instance.status,
          // JSONB nhận chuỗi JSON (xem chú thích ở orders.store.ts).
          JSON.stringify(instance.context),
          instance.createdAt,
          instance.updatedAt,
        ],
      );
      await client.query(
        'DELETE FROM workflow_instance_history WHERE instance_id = $1',
        [instance.id],
      );
      for (const entry of instance.history) {
        await client.query(
          `INSERT INTO workflow_instance_history
             (instance_id, from_state, to_state, actor, role, reason,
              handling, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            instance.id,
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

  async findById(id: string): Promise<WorkflowInstance | null> {
    return this.loadById(this.db, id);
  }

  async findByBusinessKey(
    definitionId: string,
    businessKey: string,
  ): Promise<WorkflowInstance | null> {
    const found = await this.db.query(
      `SELECT ${INSTANCE_COLUMNS} FROM workflow_instances
        WHERE definition_id = $1 AND business_key = $2`,
      [definitionId, businessKey],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return this.loadById(
      this.db,
      (found.rows[0] as Record<string, unknown>).id as string,
    );
  }

  async list(): Promise<WorkflowInstance[]> {
    const found = await this.db.query(
      `SELECT ${INSTANCE_COLUMNS} FROM workflow_instances ORDER BY id`,
    );
    const history = await this.db.query(
      `SELECT instance_id, ${HISTORY_COLUMNS}
         FROM workflow_instance_history ORDER BY id`,
    );
    const byInstance = new Map<string, Array<Record<string, unknown>>>();
    for (const row of history.rows as Array<Record<string, unknown>>) {
      const list = byInstance.get(row.instance_id as string) ?? [];
      list.push(row);
      byInstance.set(row.instance_id as string, list);
    }
    return (found.rows as Array<Record<string, unknown>>).map((row) =>
      mapInstanceRow(row, byInstance.get(row.id as string) ?? []),
    );
  }

  private async loadById(
    db: Queryable,
    id: string,
  ): Promise<WorkflowInstance | null> {
    const found = await db.query(
      `SELECT ${INSTANCE_COLUMNS} FROM workflow_instances WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    const history = await db.query(
      `SELECT ${HISTORY_COLUMNS} FROM workflow_instance_history
        WHERE instance_id = $1 ORDER BY id`,
      [id],
    );
    return mapInstanceRow(
      found.rows[0] as Record<string, unknown>,
      history.rows as Array<Record<string, unknown>>,
    );
  }
}
