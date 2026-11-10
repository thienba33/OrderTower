// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [AuditModule, WorkflowModule],
  controllers: [AppController],
})
export class AppModule {}
