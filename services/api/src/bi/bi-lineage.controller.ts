// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Param } from '@nestjs/common';
import { BI_READ_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { BiLineageService } from './bi-lineage.service';
import type { BiLineage } from './bi-lineage.types';

@Controller('bi/lineage')
@Roles(...BI_READ_ROLES)
export class BiLineageController {
  constructor(private readonly lineage: BiLineageService) {}

  @Get('latest')
  latest(): Promise<BiLineage> {
    return this.lineage.latest();
  }

  @Get(':snapshotId')
  byId(@Param('snapshotId') snapshotId: string): Promise<BiLineage> {
    return this.lineage.byId(snapshotId);
  }
}
