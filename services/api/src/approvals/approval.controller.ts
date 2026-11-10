// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ApprovalService } from './approval.service';
import type {
  Approval,
  ApprovalStatus,
  RequestApprovalInput,
} from './approval.types';

@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Post()
  request(
    @Body() body: RequestApprovalInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Approval> {
    return this.approvals.request(body, req.user);
  }

  @Get()
  list(
    @Query('type') type?: string,
    @Query('subjectId') subjectId?: string,
    @Query('status') status?: ApprovalStatus,
    @Query('requestedBy') requestedBy?: string,
  ): Promise<Approval[]> {
    return this.approvals.list({
      ...(type ? { type } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(status ? { status } : {}),
      ...(requestedBy ? { requestedBy } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Approval> {
    return this.approvals.get(id);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<Approval> {
    return this.approvals.approve(id, req.user, body.reason);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<Approval> {
    return this.approvals.reject(id, req.user, body.reason);
  }
}
