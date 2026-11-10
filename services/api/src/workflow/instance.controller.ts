// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WorkflowInstanceService } from './instance.service';
import type {
  StartInstanceInput,
  TransitionInstanceInput,
  WorkflowInstance,
  WorkflowInstanceStatus,
} from './instance.types';

// Actor và role hiện lấy từ body, sẽ thay bằng thông tin từ token Keycloak
// khi tích hợp xác thực ở API (commit phân quyền).
@Controller('workflow/instances')
export class WorkflowInstanceController {
  constructor(private readonly instances: WorkflowInstanceService) {}

  @Post()
  start(@Body() body: StartInstanceInput): WorkflowInstance {
    return this.instances.start(body);
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
  ): WorkflowInstance {
    return this.instances.transition(id, body);
  }

  @Post(':id/suspend')
  suspend(
    @Param('id') id: string,
    @Body() body: { actor: string; role: string; reason?: string },
  ): WorkflowInstance {
    return this.instances.suspend(id, body.actor, body.role, body.reason);
  }

  @Post(':id/resume')
  resume(
    @Param('id') id: string,
    @Body() body: { actor: string; role: string },
  ): WorkflowInstance {
    return this.instances.resume(id, body.actor, body.role);
  }

  @Post(':id/terminate')
  terminate(
    @Param('id') id: string,
    @Body() body: { actor: string; role: string; reason: string },
  ): WorkflowInstance {
    return this.instances.terminate(id, body.actor, body.role, body.reason);
  }
}
