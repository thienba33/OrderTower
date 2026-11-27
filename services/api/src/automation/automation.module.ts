// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { NotificationsModule } from '../notifications/notification.module';
import { OutboxModule } from '../outbox/outbox.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AutomationController } from './automation.controller';
import { AutomationScheduler } from './automation.scheduler';
import { AutomationService } from './automation.service';

@Module({
  imports: [DbModule, NotificationsModule, OutboxModule, WorkflowModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationScheduler],
  exports: [AutomationService],
})
export class AutomationModule {}
