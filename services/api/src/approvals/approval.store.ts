// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type {
  Approval,
  ApprovalStatus,
  ApprovalStore,
} from './approval.types';
import type { Transactional } from '../db/db.types';

export const APPROVAL_STORE = 'APPROVAL_STORE';

function copyApproval(approval: Approval): Approval {
  return JSON.parse(JSON.stringify(approval)) as Approval;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIso(value);
}

function mapApprovalRow(row: Record<string, unknown>): Approval {
  return {
    id: row.id as string,
    type: row.type as string,
    subjectId: row.subject_id as string,
    reason: row.reason as string,
    requestedBy: row.requested_by as string,
    requestedAt: toIso(row.requested_at),
    status: row.status as ApprovalStatus,
    decidedBy: (row.decided_by as string | null) ?? null,
    decidedAt: toNullableIso(row.decided_at),
    decisionReason: (row.decision_reason as string | null) ?? null,
    appliedAt: toNullableIso(row.applied_at),
  };
}

const APPROVAL_COLUMNS = `id, type, subject_id, reason, requested_by,
  requested_at, status, decided_by, decided_at, decision_reason, applied_at`;

// Lưu phê duyệt trong bộ nhớ. Mọi bản sao trả ra đều tách khỏi kho.
@Injectable()
export class InMemoryApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, Approval>();

  async save(approval: Approval): Promise<void> {
    this.approvals.set(approval.id, copyApproval(approval));
  }

  async findById(id: string): Promise<Approval | null> {
    const found = this.approvals.get(id);
    return found ? copyApproval(found) : null;
  }

  async list(): Promise<Approval[]> {
    return [...this.approvals.values()].map(copyApproval);
  }
}

// Lưu phê duyệt vào Postgres. Mỗi phê duyệt là 1 hàng, save() upsert 1 hàng.
export class PostgresApprovalStore implements ApprovalStore {
  constructor(private readonly db: Transactional) {}

  async save(approval: Approval): Promise<void> {
    await this.db.query(
      `INSERT INTO approvals
         (id, type, subject_id, reason, requested_by, requested_at, status,
          decided_by, decided_at, decision_reason, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type,
         subject_id = EXCLUDED.subject_id,
         reason = EXCLUDED.reason,
         requested_by = EXCLUDED.requested_by,
         requested_at = EXCLUDED.requested_at,
         status = EXCLUDED.status,
         decided_by = EXCLUDED.decided_by,
         decided_at = EXCLUDED.decided_at,
         decision_reason = EXCLUDED.decision_reason,
         applied_at = EXCLUDED.applied_at`,
      [
        approval.id,
        approval.type,
        approval.subjectId,
        approval.reason,
        approval.requestedBy,
        approval.requestedAt,
        approval.status,
        approval.decidedBy,
        approval.decidedAt,
        approval.decisionReason,
        approval.appliedAt,
      ],
    );
  }

  async findById(id: string): Promise<Approval | null> {
    const found = await this.db.query(
      `SELECT ${APPROVAL_COLUMNS} FROM approvals WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      return null;
    }
    return mapApprovalRow(found.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<Approval[]> {
    const found = await this.db.query(
      `SELECT ${APPROVAL_COLUMNS} FROM approvals ORDER BY id`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapApprovalRow);
  }
}
