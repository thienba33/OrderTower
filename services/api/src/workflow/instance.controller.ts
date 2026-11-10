// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { WorkflowInstanceService } from './instance.service';
import type {
  StartInstanceInput,
  TransitionInstanceInput,
  WorkflowInstance,
  WorkflowInstanceStatus,
} from './instance.types';

@Controller('workflow/instances')
export class WorkflowInstanceController {
  constructor(private readonly instances: WorkflowInstanceService) {}

  @Post()
  start(
    @Body() body: StartInstanceInput,
    @Req() req: AuthenticatedRequest,
  ): WorkflowInstance {
    return this.instances.start(body, req.user);
  }

  @Get()
  list(
    @Query('definitionId') definitionId?: string,
    @Query('businessKey') businessKey?: string,
    @Query('status') status?: WorkflowInstanceStatus,
  ): WorkflowInstance[] {
    return this.instances.list({
      ...(definitionId ? { definitionId } : {}),
      ...(businessKey ? { businessKey } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): WorkflowInstance {
    return this.instances.get(id);
  }

  @Post(':id/transitions')
  transition(
    @Param('id') id: string,
    @Body() body: TransitionInstanceInput,
    @Req() req: AuthenticatedRequest,
  ): WorkflowInstance {
    return this.instances.transition(id, body, req.user);
  }

  @Post(':id/suspend')
  suspend(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: AuthenticatedRequest,
  ): WorkflowInstance {
    return this.instances.suspend(id, req.user, body.reason);
  }

  @Post(':id/resume')
  resume(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): WorkflowInstance {
    return this.instances.resume(id, req.user);
  }

  @Post(':id/terminate')
  terminate(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Req() req: AuthenticatedRequest,
  ): WorkflowInstance {
    return this.instances.terminate(id, req.user, body.reason);
  }
}
