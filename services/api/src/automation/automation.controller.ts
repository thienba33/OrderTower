// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AUTOMATION_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { NotificationsService } from '../notifications/notification.service';
import type { Notification } from '../notifications/notification.types';
import { AutomationService } from './automation.service';
import type {
  AutomationJobName,
  AutomationRun,
  AutomationStatus,
} from './automation.types';

@Controller('automation')
@Roles(...AUTOMATION_ROLES)
export class AutomationController {
  constructor(
    private readonly automation: AutomationService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('status')
  status(): Promise<AutomationStatus> {
    return this.automation.status();
  }

  @Get('runs')
  runs(@Query('limit') limit?: string): Promise<AutomationRun[]> {
    return this.automation.listRuns(
      limit !== undefined ? Number.parseInt(limit, 10) : undefined,
    );
  }

  @Get('notifications')
  recentNotifications(
    @Query('limit') limit?: string,
  ): Promise<Notification[]> {
    return this.notifications.listAll(
      limit !== undefined ? Number.parseInt(limit, 10) : undefined,
    );
  }

  @Post('jobs/:job/run')
  runJob(@Param('job') job: string): Promise<AutomationRun> {
    return this.automation.run(job as AutomationJobName, 'manual');
  }
}
