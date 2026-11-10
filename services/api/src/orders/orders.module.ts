// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AddressModule } from '../address/address.module';
import { ApprovalsModule } from '../approvals/approval.module';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { InventoryModule } from '../inventory/inventory.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ORDER_STORE, PostgresOrderStore } from './orders.store';

@Module({
  imports: [
    AddressModule,
    ApprovalsModule,
    AuditModule,
    DbModule,
    InventoryModule,
    WorkflowModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    {
      provide: ORDER_STORE,
      useFactory: (db: DbService) => new PostgresOrderStore(db),
      inject: [DbService],
    },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
