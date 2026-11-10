// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { APPROVAL_STORE, PostgresApprovalStore } from './approval.store';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';

@Module({
  imports: [AuditModule, DbModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    {
      provide: APPROVAL_STORE,
      useFactory: (db: DbService) => new PostgresApprovalStore(db),
      inject: [DbService],
    },
  ],
  exports: [ApprovalService],
})
export class ApprovalsModule {}
