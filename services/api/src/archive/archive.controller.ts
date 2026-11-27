// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  ARCHIVE_READ_ROLES,
  ARCHIVE_WRITE_ROLES,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { ArchiveService } from './archive.service';
import type {
  ArchiveInput,
  ArchiveRun,
  ArchiveRunResult,
  ArchiveSummary,
  ColdAnalytics,
} from './archive.types';

@Controller('archive')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Post('orders/run')
  @Roles(...ARCHIVE_WRITE_ROLES)
  run(
    @Body() body: ArchiveInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<ArchiveRunResult> {
    return this.archive.run(body, req.user);
  }

  @Get('runs')
  @Roles(...ARCHIVE_READ_ROLES)
  listRuns(@Query('limit') limit?: string): Promise<ArchiveRun[]> {
    return this.archive.listRuns(limit);
  }

  @Get('summary')
  @Roles(...ARCHIVE_READ_ROLES)
  summary(): Promise<ArchiveSummary> {
    return this.archive.summary();
  }

  @Get('orders/analytics')
  @Roles(...ARCHIVE_READ_ROLES)
  analytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('channelId') channelId?: string,
    @Query('limit') limit?: string,
  ): Promise<ColdAnalytics> {
    return this.archive.analytics({ from, to, channelId, limit });
  }
}
