// SPDX-License-Identifier: Apache-2.0
import { Controller, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { BUSINESS_ROLE } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { TelesaleService, type TelesaleNextResult } from './telesale.service';

@Controller('ai-assignments/telesale')
export class TelesaleController {
  constructor(private readonly telesale: TelesaleService) {}

  // Cuộc gọi tiếp theo cho chính CSKH đang gọi: chỉ vai Nhân viên chăm sóc
  // khách hàng. Không có body, người nhận luôn là chính người gọi.
  @Post('next')
  @Roles(BUSINESS_ROLE.CUSTOMER_SERVICE)
  next(@Req() req: AuthenticatedRequest): Promise<TelesaleNextResult> {
    return this.telesale.next(req.user);
  }
}
