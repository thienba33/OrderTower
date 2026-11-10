// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import type {
  TransitionCheck,
  WorkflowDefinition,
} from './workflow.types';

interface TransitionCheckBody {
  from?: unknown;
  to?: unknown;
  role?: unknown;
}

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('definition')
  getDefinition(): WorkflowDefinition {
    return this.workflow.getDefinition();
  }

  @Post('transitions/check')
  checkTransition(@Body() body: TransitionCheckBody): TransitionCheck {
    if (typeof body.from !== 'string' || body.from.trim() === '') {
      throw new BadRequestException('from là bắt buộc, dạng chuỗi.');
    }
    if (typeof body.to !== 'string' || body.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    if (body.role !== undefined && typeof body.role !== 'string') {
      throw new BadRequestException('role phải là dạng chuỗi khi có.');
    }
    return this.workflow.canTransition(body.from, body.to, body.role);
  }
}
