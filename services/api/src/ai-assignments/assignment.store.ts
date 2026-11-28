// SPDX-License-Identifier: Apache-2.0
import { DbService } from '../db/db.service';
import type {
  AiAssignmentProposal,
  ProposalStore,
} from './assignment.types';

export const PROPOSAL_STORE = Symbol('PROPOSAL_STORE');

// Kho lưu trong bộ nhớ, dùng cho test đơn vị.
export class InMemoryProposalStore implements ProposalStore {
  private proposals = new Map<string, AiAssignmentProposal>();

  async save(proposal: AiAssignmentProposal): Promise<void> {
    this.proposals.set(proposal.id, JSON.parse(JSON.stringify(proposal)));
  }

  async findById(id: string): Promise<AiAssignmentProposal | null> {
    const found = this.proposals.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async list(): Promise<AiAssignmentProposal[]> {
    return [...this.proposals.values()]
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id.localeCompare(b.id)
          : a.createdAt.localeCompare(b.createdAt),
      )
      .map((proposal) => JSON.parse(JSON.stringify(proposal)));
  }
}

// Kho Postgres, lưu bền. items và skipped là JSON trong cột TEXT.
export class PostgresProposalStore implements ProposalStore {
  constructor(private readonly db: DbService) {}

  private toProposal(row: Record<string, unknown>): AiAssignmentProposal {
    return {
      id: row.id as string,
      kind: row.kind as AiAssignmentProposal['kind'],
      status: row.status as AiAssignmentProposal['status'],
      items: JSON.parse(row.items as string),
      skipped: JSON.parse(row.skipped as string),
      overloaded: row.overloaded as boolean,
      approvalId: (row.approval_id as string | null) ?? null,
      requestedBy: row.requested_by as string,
      requestedAt: (row.requested_at as Date).toISOString(),
      decidedBy: (row.decided_by as string | null) ?? null,
      decidedAt:
        row.decided_at === null
          ? null
          : (row.decided_at as Date).toISOString(),
      decisionReason: (row.decision_reason as string | null) ?? null,
      appliedAt:
        row.applied_at === null
          ? null
          : (row.applied_at as Date).toISOString(),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  async save(proposal: AiAssignmentProposal): Promise<void> {
    await this.db.query(
      `INSERT INTO ai_assignment_proposals
         (id, kind, status, items, skipped, overloaded, approval_id,
          requested_by, requested_at, decided_by, decided_at,
          decision_reason, applied_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         items = EXCLUDED.items,
         skipped = EXCLUDED.skipped,
         overloaded = EXCLUDED.overloaded,
         approval_id = EXCLUDED.approval_id,
         decided_by = EXCLUDED.decided_by,
         decided_at = EXCLUDED.decided_at,
         decision_reason = EXCLUDED.decision_reason,
         applied_at = EXCLUDED.applied_at,
         updated_at = EXCLUDED.updated_at`,
      [
        proposal.id,
        proposal.kind,
        proposal.status,
        JSON.stringify(proposal.items),
        JSON.stringify(proposal.skipped),
        proposal.overloaded,
        proposal.approvalId,
        proposal.requestedBy,
        proposal.requestedAt,
        proposal.decidedBy,
        proposal.decidedAt,
        proposal.decisionReason,
        proposal.appliedAt,
        proposal.createdAt,
        proposal.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<AiAssignmentProposal | null> {
    const found = await this.db.query(
      'SELECT * FROM ai_assignment_proposals WHERE id = $1',
      [id],
    );
    const rows = found.rows as Array<Record<string, unknown>>;
    return rows.length > 0 ? this.toProposal(rows[0]) : null;
  }

  async list(): Promise<AiAssignmentProposal[]> {
    const found = await this.db.query(
      'SELECT * FROM ai_assignment_proposals ORDER BY created_at ASC, id ASC',
    );
    return (found.rows as Array<Record<string, unknown>>).map((row) =>
      this.toProposal(row),
    );
  }
}
