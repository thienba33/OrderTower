// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
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
    @Query('orderId') orderId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('kind') kind?: AssignmentKind,
    @Query('status') status?: AssignmentStatus,
  ): Promise<Assignment[]> {
    return this.assignments.list({
      ...(orderId ? { orderId } : {}),
      ...(assignedTo ? { assignedTo } : {}),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Assignment> {
    return this.assignments.get(id);
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
