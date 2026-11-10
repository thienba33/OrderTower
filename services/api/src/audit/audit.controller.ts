// SPDX-License-Identifier: Apache-2.0
import { Controller, Get } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { AuditRecord, AuditVerifyResult } from './audit.types';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(): Promise<AuditRecord[]> {
    return this.audit.getAll();
  }

  // Endpoint kiểm tra chuỗi, dùng cho bài kiểm thử bắt buộc của Issue #17.
  @Get('verify')
  async verify(): Promise<AuditVerifyResult> {
    return this.audit.verify();
  }
}
