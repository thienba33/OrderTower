// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { WORKFLOW_READ_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { WorkflowTaskService } from './task.service';
import type { WorkflowTask } from './task.types';

@Controller('workflow/tasks')
@Roles(...WORKFLOW_READ_ROLES)
export class WorkflowTaskController {
  constructor(private readonly tasks: WorkflowTaskService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('definitionId') definitionId?: string,
    @Query('businessKey') businessKey?: string,
    @Query('overdue') overdue?: string,
    @Query('limit') limit?: string,
  ): Promise<WorkflowTask[]> {
    return this.tasks.list(req.user, {
      ...(definitionId ? { definitionId } : {}),
      ...(businessKey ? { businessKey } : {}),
      ...(overdue === 'true' ? { overdue: true } : {}),
      ...(limit !== undefined
        ? { limit: Number.parseInt(limit, 10) }
        : {}),
    });
  }
}
