// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OrdersModule } from '../orders/orders.module';
import { ReturnsModule } from '../returns/return.module';
import { RestrictedFlagsController } from './restricted-flag.controller';
import { RestrictedFlagsService } from './restricted-flag.service';
import {
  PostgresRestrictedFlagStore,
  RESTRICTED_FLAG_STORE,
} from './restricted-flag.store';

@Module({
  // Cờ cần đọc đơn và trả hàng để tính tỷ lệ hoàn. Không có vòng lặp
  // mô-đun ngược lại (OrdersModule và ReturnsModule đều không nhập mô-đun
  // này) nên nhập thẳng, không cần forwardRef.
  imports: [AuditModule, DbModule, OrdersModule, ReturnsModule],
  controllers: [RestrictedFlagsController],
  providers: [
    RestrictedFlagsService,
    {
      provide: RESTRICTED_FLAG_STORE,
      useFactory: (db: DbService) => new PostgresRestrictedFlagStore(db),
      inject: [DbService],
    },
  ],
  exports: [RestrictedFlagsService],
})
export class RestrictedFlagModule {}
