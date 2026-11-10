// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AddressModule } from '../address/address.module';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AddressModule, AuditModule, InventoryModule, WorkflowModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
