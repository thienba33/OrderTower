// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { ApprovalsModule } from './approvals/approval.module';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { ShipmentsModule } from './shipments/shipment.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [
    ApprovalsModule,
    AuditModule,
    AuthModule,
    OrdersModule,
    ShipmentsModule,
    WorkflowModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
