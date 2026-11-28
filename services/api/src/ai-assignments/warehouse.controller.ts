// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { BUSINESS_ROLE } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import type { AiAssignmentProposal } from './assignment.types';
import {
  WarehouseAssignmentService,
  type DecideProposalInput,
  type DecideProposalResult,
  type ProposeWarehouseInput,
  type ReassignWarehouseInput,
} from './warehouse.service';

@Controller('ai-assignments/warehouse')
export class WarehouseAssignmentController {
  constructor(
    private readonly warehouse: WarehouseAssignmentService,
  ) {}

  // Đề xuất chia đơn kho theo đợt: chỉ vai Điều phối viên. Bỏ trống
  // orderIds = toàn bộ đơn ở Chờ kho chưa có phân đơn kho đang hoạt động.
  @Post('propose')
  @Roles(BUSINESS_ROLE.DISPATCHER)
  propose(
    @Body() input: ProposeWarehouseInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<AiAssignmentProposal> {
    return this.warehouse.propose(input ?? {}, req.user);
  }

  // Chia lại khi nhân viên nghỉ đột xuất: chỉ vai Điều phối viên.
  @Post('reassign')
  @Roles(BUSINESS_ROLE.DISPATCHER)
  reassign(
    @Body() input: ReassignWarehouseInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<AiAssignmentProposal> {
    return this.warehouse.reassign(input, req.user);
  }

  // Danh sách đề xuất gần đây nhất trước.
  @Get('proposals')
  list(): Promise<AiAssignmentProposal[]> {
    return this.warehouse.list();
  }

  // Xem lại 1 đề xuất (mở lại modal hoặc Quản lý xem đề xuất vượt tải).
  @Get(':id')
  get(@Param('id') id: string): Promise<AiAssignmentProposal> {
    return this.warehouse.get(id);
  }

  // Duyệt đề xuất: chỉ vai Điều phối viên. Duyệt cả đợt 1 lần; từ chối bắt
  // buộc có lý do; đề xuất đã quyết định thì không quyết định lại được.
  @Post(':id/decision')
  @Roles(BUSINESS_ROLE.DISPATCHER)
  decide(
    @Param('id') id: string,
    @Body() input: DecideProposalInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<DecideProposalResult> {
    return this.warehouse.decide(id, input, req.user);
  }
}
