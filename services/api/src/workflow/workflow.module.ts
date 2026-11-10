// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { WorkflowInstanceController } from './instance.controller';
import { WorkflowInstanceService } from './instance.service';
import {
  PostgresWorkflowInstanceStore,
  WORKFLOW_INSTANCE_STORE,
} from './instance.store';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [AuditModule, DbModule],
  controllers: [WorkflowController, WorkflowInstanceController],
  providers: [
    WorkflowService,
    WorkflowInstanceService,
    {
      provide: WORKFLOW_INSTANCE_STORE,
      useFactory: (db: DbService) =>
        new PostgresWorkflowInstanceStore(db),
      inject: [DbService],
    },
  ],
  exports: [WorkflowService, WorkflowInstanceService],
})
export class WorkflowModule {}
