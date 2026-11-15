// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OrdersModule } from '../orders/orders.module';
import { ReturnsController } from './return.controller';
import { ReturnsService } from './return.service';
import { PostgresReturnStore, RETURN_STORE } from './return.store';

@Module({
  imports: [AuditModule, DbModule, OrdersModule],
  controllers: [ReturnsController],
  providers: [
    ReturnsService,
    {
      provide: RETURN_STORE,
      useFactory: (db: DbService) => new PostgresReturnStore(db),
      inject: [DbService],
    },
  ],
  exports: [ReturnsService],
})
export class ReturnsModule {}
