// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approval.module';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { WorkflowDeploymentController } from './deployment.controller';
import { WorkflowDeploymentService } from './deployment.service';
import { WorkflowInstanceController } from './instance.controller';
import { WorkflowInstanceService } from './instance.service';
import {
  PostgresWorkflowInstanceStore,
  WORKFLOW_INSTANCE_STORE,
} from './instance.store';
import {
  PostgresWorkflowVersionStore,
  WORKFLOW_VERSION_STORE,
} from './version.store';
import { WorkflowTaskController } from './task.controller';
import { WorkflowTaskService } from './task.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [ApprovalsModule, AuditModule, DbModule],
  controllers: [
    WorkflowController,
    WorkflowInstanceController,
    WorkflowTaskController,
    WorkflowDeploymentController,
  ],
  providers: [
    WorkflowService,
    WorkflowInstanceService,
    WorkflowTaskService,
    WorkflowDeploymentService,
    {
      provide: WORKFLOW_INSTANCE_STORE,
      useFactory: (db: DbService) =>
        new PostgresWorkflowInstanceStore(db),
      inject: [DbService],
    },
    {
      provide: WORKFLOW_VERSION_STORE,
      useFactory: (db: DbService) => new PostgresWorkflowVersionStore(db),
      inject: [DbService],
    },
  ],
  exports: [WorkflowService, WorkflowInstanceService, WORKFLOW_VERSION_STORE],
})
export class WorkflowModule {}
