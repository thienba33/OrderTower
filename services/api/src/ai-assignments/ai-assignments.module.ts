// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AssignmentModule } from '../assignments/assignment.module';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { TelesaleController } from './telesale.controller';
import { TelesaleService } from './telesale.service';

@Module({
  imports: [AssignmentModule, AuditModule, OrdersModule],
  controllers: [TelesaleController],
  providers: [TelesaleService],
  exports: [TelesaleService],
})
export class AiAssignmentsModule {}
