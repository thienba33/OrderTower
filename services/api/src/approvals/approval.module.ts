// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { APPROVAL_STORE, InMemoryApprovalStore } from './approval.store';

@Module({
  imports: [AuditModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    { provide: APPROVAL_STORE, useClass: InMemoryApprovalStore },
  ],
  exports: [ApprovalService],
})
export class ApprovalsModule {}
