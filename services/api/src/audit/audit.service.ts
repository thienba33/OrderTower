// SPDX-License-Identifier: Apache-2.0
import { Inject, Injectable, Optional } from '@nestjs/common';
import { GENESIS_PREV_HASH, computeAuditHash } from './audit.hash';
import { AUDIT_STORE, InMemoryAuditStore } from './audit.store';
import type { AuditStore } from './audit.store';
import type {
  AuditRecord,
  AuditVerifyResult,
  NewAuditRecord,
} from './audit.types';

// Nhật ký chỉ ghi thêm: không sửa, không xóa. Sửa bản ghi sẽ làm lệch hash
// và bị phát hiện khi kiểm tra chuỗi. Kho mặc định là Postgres (xem
// audit.module.ts); bộ nhớ chỉ dùng khi khởi tạo thủ công trong kiểm thử.
@Injectable()
export class AuditService {
  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị cũ không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    @Optional()
    @Inject(AUDIT_STORE)
    private readonly store: AuditStore = new InMemoryAuditStore(),
  ) {}

  async append(input: NewAuditRecord): Promise<AuditRecord> {
    return this.store.append(input);
  }

  async getAll(): Promise<AuditRecord[]> {
    return this.store.getAll();
  }

  async verify(): Promise<AuditVerifyResult> {
    const records = await this.store.getAll();
    let prevHash = GENESIS_PREV_HASH;
    for (const record of records) {
      if (record.prevHash !== prevHash) {
        return { valid: false, checked: records.length, brokenAt: record.seq };
      }
      const { hash, ...rest } = record;
      if (computeAuditHash(rest) !== hash) {
        return { valid: false, checked: records.length, brokenAt: record.seq };
      }
      prevHash = record.hash;
    }
    return { valid: true, checked: records.length, brokenAt: null };
  }
}
