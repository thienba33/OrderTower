// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ReturnsService } from './return.service';
import type {
  CreateReturnInput,
  RejectReturnInput,
  Return,
  ReturnStatus,
} from './return.types';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  create(
    @Body() body: CreateReturnInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Return> {
    return this.returns.create(body, req.user);
  }

  @Get()
  list(
    @Query('orderId') orderId?: string,
    @Query('status') status?: ReturnStatus,
  ): Promise<Return[]> {
    return this.returns.list({
      ...(orderId ? { orderId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Return> {
    return this.returns.get(id);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Return> {
    return this.returns.approve(id, req.user);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: RejectReturnInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Return> {
    return this.returns.reject(id, body, req.user);
  }

  @Post(':id/refund')
  refund(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Return> {
    return this.returns.refund(id, req.user);
  }
}
