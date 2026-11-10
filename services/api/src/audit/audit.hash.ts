// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import type { AuditRecord } from './audit.types';

// Chuỗi hash của nhật ký chỉ ghi thêm. Mọi kho (bộ nhớ và Postgres) dùng
// chung hàm này, nên thứ tự trường trong payload KHÔNG được đổi: đổi một
// trường hay thứ tự là toàn bộ chuỗi hash cũ không còn khớp khi verify().
export const GENESIS_PREV_HASH = '0'.repeat(64);

// Bản ghi chưa có hash: mọi trường dùng để băm, trừ trường hash.
export type UnsignedAuditRecord = Omit<AuditRecord, 'hash'>;

export function computeAuditHash(record: UnsignedAuditRecord): string {
  const payload = {
    seq: record.seq,
    at: record.at,
    actor: record.actor,
    role: record.role,
    action: record.action,
    orderId: record.orderId,
    from: record.from,
    to: record.to,
    detail: record.detail,
    prevHash: record.prevHash,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
