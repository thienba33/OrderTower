// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AUDIT_STORE, PostgresAuditStore } from './audit.store';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';

@Module({
  imports: [DbModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: AUDIT_STORE,
      useFactory: (db: DbService) => new PostgresAuditStore(db),
      inject: [DbService],
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
