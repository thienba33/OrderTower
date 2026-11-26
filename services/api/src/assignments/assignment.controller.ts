// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  ASSIGNMENT_READ_ROLES,
  CALL_LOG_READ_ROLES,
  isDispatcherOrAbove,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { AssignmentsService, CallLogsService } from './assignment.service';
import type {
  Assignment,
  AssignmentKind,
  AssignmentStatus,
  CallLog,
  CancelAssignmentInput,
  CreateAssignmentInput,
  CreateCallLogInput,
} from './assignment.types';

@Controller('assignments')
@Roles(...ASSIGNMENT_READ_ROLES)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  create(
    @Body() body: CreateAssignmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Assignment> {
    return this.assignments.create(body, req.user);
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('orderId') orderId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('kind') kind?: AssignmentKind,
    @Query('status') status?: AssignmentStatus,
  ): Promise<Assignment[]> {
    // Người không phải điều phối/quản lý/admin chỉ thấy việc của mình,
    // không tin tham số assignedTo do client gửi.
    const effectiveAssignedTo = isDispatcherOrAbove(req.user.roles)
      ? assignedTo
      : req.user.username;
    return this.assignments.list({
      ...(orderId ? { orderId } : {}),
      ...(effectiveAssignedTo ? { assignedTo: effectiveAssignedTo } : {}),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Assignment> {
    const assignment = await this.assignments.get(id);
    if (
      !isDispatcherOrAbove(req.user.roles) &&
      assignment.assignedTo !== req.user.username
    ) {
      throw new ForbiddenException(
        `Tài khoản ${req.user.username} không được xem phân công ${id}.`,
      );
    }
    return assignment;
  }

  @Post(':id/start')
  start(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Assignment> {
    return this.assignments.start(id, req.user);
  }

  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Assignment> {
    return this.assignments.complete(id, req.user);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() body: CancelAssignmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Assignment> {
    return this.assignments.cancel(id, body, req.user);
  }
}

@Controller('call-logs')
@Roles(...CALL_LOG_READ_ROLES)
export class CallLogsController {
  constructor(private readonly callLogs: CallLogsService) {}

  @Post()
  create(
    @Body() body: CreateCallLogInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<CallLog> {
    return this.callLogs.create(body, req.user);
  }

  @Get()
  list(
    @Query('orderId') orderId?: string,
    @Query('caller') caller?: string,
    @Query('assignmentId') assignmentId?: string,
  ): Promise<CallLog[]> {
    return this.callLogs.list({
      ...(orderId ? { orderId } : {}),
      ...(caller ? { caller } : {}),
      ...(assignmentId ? { assignmentId } : {}),
    });
  }
}
