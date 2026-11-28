// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approval.module';
import { AssignmentModule } from '../assignments/assignment.module';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OrdersModule } from '../orders/orders.module';
import {
  PROPOSAL_STORE,
  PostgresProposalStore,
} from './assignment.store';
import { TelesaleController } from './telesale.controller';
import { TelesaleService } from './telesale.service';
import { WarehouseAssignmentController } from './warehouse.controller';
import { WarehouseAssignmentService } from './warehouse.service';

@Module({
  imports: [ApprovalsModule, AssignmentModule, AuditModule, DbModule, OrdersModule],
  controllers: [TelesaleController, WarehouseAssignmentController],
  providers: [
    TelesaleService,
    WarehouseAssignmentService,
    {
      provide: PROPOSAL_STORE,
      useFactory: (db: DbService) => new PostgresProposalStore(db),
      inject: [DbService],
    },
  ],
  exports: [TelesaleService, WarehouseAssignmentService],
})
export class AiAssignmentsModule {}
