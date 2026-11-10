// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkflowInstanceController } from './instance.controller';
import { WorkflowInstanceService } from './instance.service';
import {
  InMemoryWorkflowInstanceStore,
  WORKFLOW_INSTANCE_STORE,
} from './instance.store';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [AuditModule],
  controllers: [WorkflowController, WorkflowInstanceController],
  providers: [
    WorkflowService,
    WorkflowInstanceService,
    {
      provide: WORKFLOW_INSTANCE_STORE,
      useClass: InMemoryWorkflowInstanceStore,
    },
  ],
  exports: [WorkflowService, WorkflowInstanceService],
})
export class WorkflowModule {}
