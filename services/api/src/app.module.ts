// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { OrdersModule } from './orders/orders.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [AuditModule, OrdersModule, WorkflowModule],
  controllers: [AppController],
})
export class AppModule {}
