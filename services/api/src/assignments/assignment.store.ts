// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import type {
  Assignment,
  AssignmentKind,
  AssignmentStatus,
  AssignmentStore,
  CallLog,
  CallLogStore,
  CallResult,
} from './assignment.types';

export const ASSIGNMENT_STORE = 'ASSIGNMENT_STORE';
export const CALL_LOG_STORE = 'CALL_LOG_STORE';

function copyAssignment(assignment: Assignment): Assignment {
  return JSON.parse(JSON.stringify(assignment)) as Assignment;
}

function copyCallLog(log: CallLog): CallLog {
  return JSON.parse(JSON.stringify(log)) as CallLog;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapAssignmentRow(row: Record<string, unknown>): Assignment {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    kind: row.kind as AssignmentKind,
    assignedTo: row.assigned_to as string,
    assignedBy: row.assigned_by as string,
    status: row.status as AssignmentStatus,
    cancelReason: row.cancel_reason as string | null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapCallLogRow(row: Record<string, unknown>): CallLog {
  return {
    id: row.id as string,
    assignmentId: row.assignment_id as string,
    orderId: row.order_id as string,
    caller: row.caller as string,
    result: row.result as CallResult,
    // node-postgres trả cột INTEGER dạng số, nhưng ép Number() cho chắc,
    // giống cách sửa lỗi BIGINT ở audit (seq trả về dạng chuỗi).
    durationSeconds: Number(row.duration_seconds),
    note: row.note as string | null,
    createdAt: toIso(row.created_at),
  };
}

const ASSIGNMENT_COLUMNS = `id, order_id, kind, assigned_to, assigned_by, status, cancel_reason, created_at, updated_at`;
const CALL_LOG_COLUMNS = `id, assignment_id, order_id, caller, result, duration_seconds, note, created_at`;

// Lưu phân đơn trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryAssignmentStore implements AssignmentStore {
  private readonly assignments = new Map<string, Assignment>();

  async save(assignment: Assignment): Promise<void> {
    this.assignments.set(assignment.id, copyAssignment(assignment));
  }

  async findById(id: string): Promise<Assignment | null> {
    const found = this.assignments.get(id);
    return found ? copyAssignment(found) : null;
  }

  async findByOrderIdAndKind(
    orderId: string,
    kind: AssignmentKind,
  ): Promise<Assignment[]> {
    return [...this.assignments.values()]
      .filter((item) => item.orderId === orderId && item.kind === kind)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copyAssignment);
  }

  async list(): Promise<Assignment[]> {
    return [...this.assignments.values()].map(copyAssignment);
  }
}

// Lưu phân đơn vào Postgres. save() là upsert 1 hàng theo id; đơn có tối
// đa 1 phân đơn đang hoạt động theo từng loại được giữ bằng kiểm tra ở
// service (xem AssignmentsService), không bằng ràng buộc DB.
export class PostgresAssignmentStore implements AssignmentStore {
  constructor(private readonly db: Queryable) {}

  async save(assignment: Assignment): Promise<void> {
    await this.db.query(
      `INSERT INTO assignments
         (id, order_id, kind, assigned_to, assigned_by, status, cancel_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         kind = EXCLUDED.kind,
         assigned_to = EXCLUDED.assigned_to,
         assigned_by = EXCLUDED.assigned_by,
         status = EXCLUDED.status,
         cancel_reason = EXCLUDED.cancel_reason,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        assignment.id,
        assignment.orderId,
        assignment.kind,
        assignment.assignedTo,
        assignment.assignedBy,
        assignment.status,
        assignment.cancelReason,
        assignment.createdAt,
        assignment.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Assignment | null> {
    const found = await this.db.query(
      `SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapAssignmentRow(found.rows[0] as Record<string, unknown>);
  }

  async findByOrderIdAndKind(
    orderId: string,
    kind: AssignmentKind,
  ): Promise<Assignment[]> {
    const found = await this.db.query(
      `SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE order_id = $1 AND kind = $2 ORDER BY id`,
      [orderId, kind],
    );
    return (found.rows as Array<Record<string, unknown>>).map(
      mapAssignmentRow,
    );
  }

  async list(): Promise<Assignment[]> {
    const found = await this.db.query(
      `SELECT ${ASSIGNMENT_COLUMNS} FROM assignments ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(
      mapAssignmentRow,
    );
  }
}

// Lưu nhật ký cuộc gọi trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryCallLogStore implements CallLogStore {
  private readonly logs = new Map<string, CallLog>();

  async save(log: CallLog): Promise<void> {
    this.logs.set(log.id, copyCallLog(log));
  }

  async findById(id: string): Promise<CallLog | null> {
    const found = this.logs.get(id);
    return found ? copyCallLog(found) : null;
  }

  async findByAssignmentId(assignmentId: string): Promise<CallLog[]> {
    return [...this.logs.values()]
      .filter((log) => log.assignmentId === assignmentId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copyCallLog);
  }

  async list(): Promise<CallLog[]> {
    return [...this.logs.values()].map(copyCallLog);
  }
}

// Lưu nhật ký cuộc gọi vào Postgres. save() là upsert 1 hàng theo id;
// nhật ký chỉ ghi thêm, không sửa, nhưng upsert giữ cùng cách làm với các
// kho khác trong dự án.
export class PostgresCallLogStore implements CallLogStore {
  constructor(private readonly db: Queryable) {}

  async save(log: CallLog): Promise<void> {
    await this.db.query(
      `INSERT INTO call_logs
         (id, assignment_id, order_id, caller, result, duration_seconds, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         assignment_id = EXCLUDED.assignment_id,
         order_id = EXCLUDED.order_id,
         caller = EXCLUDED.caller,
         result = EXCLUDED.result,
         duration_seconds = EXCLUDED.duration_seconds,
         note = EXCLUDED.note,
         created_at = EXCLUDED.created_at`,
      [
        log.id,
        log.assignmentId,
        log.orderId,
        log.caller,
        log.result,
        log.durationSeconds,
        log.note,
        log.createdAt,
      ],
    );
  }

  async findById(id: string): Promise<CallLog | null> {
    const found = await this.db.query(
      `SELECT ${CALL_LOG_COLUMNS} FROM call_logs WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapCallLogRow(found.rows[0] as Record<string, unknown>);
  }

  async findByAssignmentId(assignmentId: string): Promise<CallLog[]> {
    const found = await this.db.query(
      `SELECT ${CALL_LOG_COLUMNS} FROM call_logs WHERE assignment_id = $1 ORDER BY id`,
      [assignmentId],
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapCallLogRow);
  }

  async list(): Promise<CallLog[]> {
    const found = await this.db.query(
      `SELECT ${CALL_LOG_COLUMNS} FROM call_logs ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapCallLogRow);
  }
}
