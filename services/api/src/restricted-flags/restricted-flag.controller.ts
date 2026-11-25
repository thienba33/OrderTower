// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { RESTRICTED_FLAG_READ_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { RestrictedFlagsService } from './restricted-flag.service';
import type {
  CreateRestrictedFlagInput,
  ReasonInput,
  RestrictedFlag,
  RestrictedFlagDetail,
  RestrictedFlagSource,
  RestrictedFlagStatus,
} from './restricted-flag.types';

@Controller('restricted-flags')
@Roles(...RESTRICTED_FLAG_READ_ROLES)
export class RestrictedFlagsController {
  constructor(private readonly flags: RestrictedFlagsService) {}

  @Post()
  create(
    @Body() body: CreateRestrictedFlagInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<RestrictedFlag> {
    return this.flags.create(body, req.user);
  }

  @Get()
  list(
    @Query('status') status?: RestrictedFlagStatus,
    @Query('source') source?: RestrictedFlagSource,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ): Promise<RestrictedFlagDetail[]> {
    return this.flags.list({
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(orderId ? { orderId } : {}),
      ...(customerId ? { customerId } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<RestrictedFlagDetail> {
    return this.flags.get(id);
  }

  @Post(':id/release')
  release(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RestrictedFlag> {
    return this.flags.release(id, req.user);
  }

  @Post(':id/propose-restrict')
  proposeRestrict(
    @Param('id') id: string,
    @Body() body: ReasonInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<RestrictedFlag> {
    return this.flags.proposeRestrict(id, body, req.user);
  }

  @Post(':id/approve-restrict')
  approveRestrict(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RestrictedFlag> {
    return this.flags.approveRestrict(id, req.user);
  }

  @Post(':id/reject-restrict')
  rejectRestrict(
    @Param('id') id: string,
    @Body() body: ReasonInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<RestrictedFlag> {
    return this.flags.rejectRestrict(id, body, req.user);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() body: ReasonInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<RestrictedFlag> {
    return this.flags.cancel(id, body, req.user);
  }
}
