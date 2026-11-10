// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import type {
  TransitionCheck,
  WorkflowDefinition,
} from './workflow.types';

interface TransitionCheckBody {
  definitionId?: unknown;
  from?: unknown;
  to?: unknown;
  role?: unknown;
}

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('definitions')
  listDefinitions(): WorkflowDefinition[] {
    return this.workflow.listDefinitions();
  }

  @Get('definition')
  getDefinition(
    @Query('definitionId') definitionId?: string,
  ): WorkflowDefinition {
    return this.workflow.getDefinition(definitionId ?? 'order-flow');
  }

  @Post('transitions/check')
  checkTransition(@Body() body: TransitionCheckBody): TransitionCheck {
    if (
      body.definitionId !== undefined &&
      typeof body.definitionId !== 'string'
    ) {
      throw new BadRequestException(
        'definitionId phải là dạng chuỗi khi có.',
      );
    }
    if (typeof body.from !== 'string' || body.from.trim() === '') {
      throw new BadRequestException('from là bắt buộc, dạng chuỗi.');
    }
    if (typeof body.to !== 'string' || body.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    if (body.role !== undefined && typeof body.role !== 'string') {
      throw new BadRequestException('role phải là dạng chuỗi khi có.');
    }
    return this.workflow.canTransition(
      body.definitionId ?? 'order-flow',
      body.from,
      body.to,
      body.role,
    );
  }
}
