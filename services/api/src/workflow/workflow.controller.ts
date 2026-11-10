// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { WorkflowService } from './workflow.service';
import type {
  TransitionCheck,
  WorkflowDefinition,
} from './workflow.types';

interface TransitionCheckBody {
  definitionId?: unknown;
  from?: unknown;
  to?: unknown;
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

  // Kiểm tra theo vai của người gọi (lấy từ token), không nhận vai từ body.
  @Post('transitions/check')
  checkTransition(
    @Body() body: TransitionCheckBody,
    @Req() req: AuthenticatedRequest,
  ): TransitionCheck {
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
    return this.workflow.canTransition(
      body.definitionId ?? 'order-flow',
      body.from,
      body.to,
      req.user.roles,
    );
  }
}
