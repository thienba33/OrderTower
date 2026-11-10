// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [AuditModule, AuthModule, OrdersModule, WorkflowModule],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
