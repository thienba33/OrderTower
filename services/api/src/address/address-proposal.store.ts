// SPDX-License-Identifier: Apache-2.0
import { Inject, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import {
  AddressProposal,
  AddressProposalStore,
  AddressSnapshot,
} from './address.types';

export const ADDRESS_PROPOSAL_STORE = Symbol('ADDRESS_PROPOSAL_STORE');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function parseSnapshot(value: unknown): AddressSnapshot {
  if (typeof value === 'string') return JSON.parse(value) as AddressSnapshot;
  return value as AddressSnapshot;
}

@Injectable()
export class InMemoryAddressProposalStore implements AddressProposalStore {
  private readonly items = new Map<string, AddressProposal>();

  async save(proposal: AddressProposal): Promise<void> {
    this.items.set(proposal.id, clone(proposal));
  }

  async update(proposal: AddressProposal): Promise<void> {
    this.items.set(proposal.id, clone(proposal));
  }

  async findById(id: string): Promise<AddressProposal | null> {
    const found = this.items.get(id);
    return found ? clone(found) : null;
  }

  async listByOrderId(orderId: string): Promise<AddressProposal[]> {
    return [...this.items.values()]
      .filter((p) => p.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => clone(p));
  }

  async listIds(): Promise<string[]> {
    return [...this.items.keys()];
  }
}

@Injectable()
export class PostgresAddressProposalStore implements AddressProposalStore {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async save(proposal: AddressProposal): Promise<void> {
    // JSONB nhận chuỗi JSON (xem chú thích trong
    // services/api/src/orders/orders.store.ts).
    await this.db.query(
      `INSERT INTO address_proposals
         (id, order_id, status, source, before_json, after_json,
          requested_by, requested_at, decided_by, decided_at,
          decision_reason, applied_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        proposal.id,
        proposal.orderId,
        proposal.status,
        proposal.source,
        JSON.stringify(proposal.before),
        JSON.stringify(proposal.after),
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

  async update(proposal: AddressProposal): Promise<void> {
    await this.db.query(
      `UPDATE address_proposals SET
         status = $2, before_json = $3, after_json = $4,
         decided_by = $5, decided_at = $6, decision_reason = $7,
         applied_at = $8, updated_at = $9
       WHERE id = $1`,
      [
        proposal.id,
        proposal.status,
        JSON.stringify(proposal.before),
        JSON.stringify(proposal.after),
        proposal.decidedBy,
        proposal.decidedAt,
        proposal.decisionReason,
        proposal.appliedAt,
        proposal.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<AddressProposal | null> {
    const { rows } = await this.db.query(
      'SELECT * FROM address_proposals WHERE id = $1',
      [id],
    );
    return rows.length > 0 ? toProposal(rows[0] as Record<string, unknown>) : null;
  }

  async listByOrderId(orderId: string): Promise<AddressProposal[]> {
    const { rows } = await this.db.query(
      'SELECT * FROM address_proposals WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId],
    );
    return rows.map(toProposal);
  }

  async listIds(): Promise<string[]> {
    const { rows } = await this.db.query('SELECT id FROM address_proposals', []);
    return rows.map((row: { id: string }) => row.id);
  }
}

function toProposal(row: Record<string, unknown>): AddressProposal {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    status: row.status as AddressProposal['status'],
    source: (row.source as AddressProposal['source']) ?? 'rules',
    before: parseSnapshot(row.before_json),
    after: parseSnapshot(row.after_json),
    requestedBy: row.requested_by as string,
    requestedAt: toIso(row.requested_at),
    decidedBy: row.decided_by as string | null,
    decidedAt: row.decided_at ? toIso(row.decided_at) : null,
    decisionReason: row.decision_reason as string | null,
    appliedAt: row.applied_at ? toIso(row.applied_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
