// SPDX-License-Identifier: Apache-2.0
import { GENESIS_PREV_HASH, computeAuditHash } from './audit.hash';
import type { AuditRecord, NewAuditRecord } from './audit.types';
import type { Transactional } from '../db/db.types';

export const AUDIT_STORE = 'AUDIT_STORE';

// Kho nhật ký audit. InMemory dùng cho kiểm thử đơn vị; Postgres là kho mặc
// định khi chạy thật. Cả hai đều phải giữ đúng ngữ nghĩa chuỗi hash: số thứ
// tự tăng dần, prevHash nối đúng bản ghi trước.
export interface AuditStore {
  append(input: NewAuditRecord): Promise<AuditRecord>;
  getAll(): Promise<AuditRecord[]>;
}

// Dựng bản ghi đầy đủ từ số thứ tự, prevHash và đầu vào. Thời điểm at được
// chuẩn hóa về dạng ISO có mili giây, vì giá trị lưu vào TIMESTAMPTZ rồi đọc
// ra sẽ ở đúng dạng này; chuẩn hóa trước khi băm để verify() khớp tuyệt đối.
function buildRecord(
  seq: number,
  prevHash: string,
  input: NewAuditRecord,
): AuditRecord {
  const base = {
    seq,
    at: new Date(input.at ?? new Date().toISOString()).toISOString(),
    actor: input.actor,
    role: input.role,
    action: input.action,
    orderId: input.orderId,
    from: input.from ?? null,
    to: input.to ?? null,
    detail: input.detail ?? '',
    prevHash,
  };
  return { ...base, hash: computeAuditHash(base) };
}

export class InMemoryAuditStore implements AuditStore {
  private readonly records: AuditRecord[] = [];

  async append(input: NewAuditRecord): Promise<AuditRecord> {
    const previous = this.records[this.records.length - 1];
    const record = buildRecord(
      this.records.length + 1,
      previous ? previous.hash : GENESIS_PREV_HASH,
      input,
    );
    this.records.push(record);
    return { ...record };
  }

  async getAll(): Promise<AuditRecord[]> {
    return this.records.map((record) => ({ ...record }));
  }
}

export class PostgresAuditStore implements AuditStore {
  constructor(private readonly db: Transactional) {}

  // Ghi trong 1 giao dịch: khóa bản ghi cuối chuỗi, đọc prevHash, băm rồi
  // mới chèn. Hai lần ghi đồng thời không thể cùng nối vào 1 prevHash.
  async append(input: NewAuditRecord): Promise<AuditRecord> {
    return this.db.withTransaction(async (client) => {
      const last = await client.query(
        'SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1 FOR UPDATE',
      );
      const lastRow = (last.rows as Array<{ seq: number; hash: string }>)[0];
      const prevHash = lastRow ? lastRow.hash : GENESIS_PREV_HASH;
      const seq = lastRow ? lastRow.seq + 1 : 1;
      const record = buildRecord(seq, prevHash, input);
      await client.query(
        `INSERT INTO audit_log
          (seq, at, actor, role, action, order_id, from_state, to_state,
           detail, prev_hash, hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          record.seq,
          record.at,
          record.actor,
          record.role,
          record.action,
          record.orderId,
          record.from,
          record.to,
          record.detail,
          record.prevHash,
          record.hash,
          record.at,
        ],
      );
      return record;
    });
  }

  async getAll(): Promise<AuditRecord[]> {
    const result = await this.db.query(
      `SELECT seq, at, actor, role, action, order_id, from_state, to_state,
              detail, prev_hash, hash
         FROM audit_log ORDER BY seq ASC`,
    );
    return (result.rows as Array<Record<string, unknown>>).map(mapAuditRow);
  }
}

// Một hàng TIMESTAMPTZ đọc từ Postgres trả về đối tượng Date; chuẩn hóa về
// chuỗi ISO để khớp đúng dạng at đã băm lúc ghi.
export function mapAuditRow(row: Record<string, unknown>): AuditRecord {
  const at = row.at instanceof Date ? row.at.toISOString() : String(row.at);
  return {
    seq: row.seq as number,
    at,
    actor: row.actor as string,
    role: row.role as string,
    action: row.action as string,
    // Mọi lần ghi qua append đều đưa orderId (kiểu NewAuditRecord bắt buộc),
    // nên cột này thực tế không bao giờ null dù migration để nullable.
    orderId: row.order_id as string,
    from: (row.from_state as string | null) ?? null,
    to: (row.to_state as string | null) ?? null,
    detail: row.detail as string,
    prevHash: row.prev_hash as string,
    hash: row.hash as string,
  };
}
