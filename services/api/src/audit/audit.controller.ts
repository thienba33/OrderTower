// SPDX-License-Identifier: Apache-2.0
import { Controller, Get } from '@nestjs/common';
import {
  AUDIT_READ_ROLES,
  AUDIT_VERIFY_ROLES,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from './audit.service';
import type { AuditRecord, AuditVerifyResult } from './audit.types';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(...AUDIT_READ_ROLES)
  async list(): Promise<AuditRecord[]> {
    return this.audit.getAll();
  }

  // Endpoint kiểm tra chuỗi, dùng cho bài kiểm thử bắt buộc của Issue #17.
  @Get('verify')
  @Roles(...AUDIT_VERIFY_ROLES)
  async verify(): Promise<AuditVerifyResult> {
    return this.audit.verify();
  }
}
