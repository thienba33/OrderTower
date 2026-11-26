// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Post, Query } from '@nestjs/common';
import { OUTBOX_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import type { OutboxEvent, OutboxRelayResult, OutboxStatus } from './outbox.types';
import { OutboxService } from './outbox.service';

@Controller('outbox')
@Roles(...OUTBOX_ROLES)
export class OutboxController {
  constructor(private readonly outbox: OutboxService) {}

  @Get()
  list(
    @Query('status') status?: OutboxStatus,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ): Promise<OutboxEvent[]> {
    return this.outbox.list({
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(limit !== undefined ? { limit: Number.parseInt(limit, 10) } : {}),
    });
  }

  @Post('relay')
  relay(@Query('limit') limit?: string): Promise<OutboxRelayResult> {
    return this.outbox.relay(
      limit !== undefined ? Number.parseInt(limit, 10) : undefined,
    );
  }
}
