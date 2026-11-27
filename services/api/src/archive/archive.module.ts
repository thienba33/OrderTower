// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import {
  ARCHIVE_STORE,
  PostgresArchiveStore,
} from './archive.store';

@Module({
  imports: [
    AuditModule,
    DbModule,
    OrdersModule,
    StorageModule,
    TenantModule,
  ],
  controllers: [ArchiveController],
  providers: [
    ArchiveService,
    {
      provide: ARCHIVE_STORE,
      useFactory: (db: DbService) => new PostgresArchiveStore(db),
      inject: [DbService],
    },
  ],
  exports: [ArchiveService],
})
export class ArchiveModule {}
