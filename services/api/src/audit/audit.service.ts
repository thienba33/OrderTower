// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  AuditRecord,
  AuditVerifyResult,
  NewAuditRecord,
} from './audit.types';

// Hash khởi đầu của chuỗi, dùng khi log còn rỗng.
export const GENESIS_PREV_HASH = '0'.repeat(64);

function computeHash(record: Omit<AuditRecord, 'hash'>): string {
  const payload = JSON.stringify({
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
  });
  return createHash('sha256').update(payload).digest('hex');
}

// Nhật ký chỉ ghi thêm: không sửa, không xóa. Sửa bản ghi sẽ làm lệch hash
// và bị phát hiện khi kiểm tra chuỗi. Hiện lưu trong bộ nhớ, sẽ chuyển sang
// Postgres khi nhánh platform-database vào dev.
@Injectable()
export class AuditService {
  private readonly records: AuditRecord[] = [];

  append(input: NewAuditRecord): AuditRecord {
    const prevHash =
      this.records.length === 0
        ? GENESIS_PREV_HASH
        : this.records[this.records.length - 1].hash;
    const base: Omit<AuditRecord, 'hash'> = {
      seq: this.records.length + 1,
      at: input.at ?? new Date().toISOString(),
      actor: input.actor,
      role: input.role,
      action: input.action,
      orderId: input.orderId,
      from: input.from ?? null,
      to: input.to ?? null,
      detail: input.detail ?? '',
      prevHash,
    };
    const record: AuditRecord = { ...base, hash: computeHash(base) };
    this.records.push(record);
    return { ...record };
  }

  getAll(): AuditRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  verify(): AuditVerifyResult {
    let prevHash = GENESIS_PREV_HASH;
    for (const record of this.records) {
      if (record.prevHash !== prevHash) {
        return { valid: false, checked: this.records.length, brokenAt: record.seq };
      }
      const { hash, ...rest } = record;
      if (computeHash(rest) !== hash) {
        return { valid: false, checked: this.records.length, brokenAt: record.seq };
      }
      prevHash = record.hash;
    }
    return { valid: true, checked: this.records.length, brokenAt: null };
  }
}
