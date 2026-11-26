// SPDX-License-Identifier: Apache-2.0
import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { ORDER_RETURN_GATE } from '../orders/order-return-gate';
import { OrdersModule } from '../orders/orders.module';
import { ReturnsController } from './return.controller';
import { ReturnGateAdapter } from './return-gate.adapter';
import { ReturnsService } from './return.service';
import { PostgresReturnStore, RETURN_STORE } from './return.store';
import type { ReturnStore } from './return.types';

@Module({
  // forwardRef với OrdersModule: trả hàng cần kiểm tra đơn, đơn cần cổng
  // đọc trả hàng (xem OrdersModule). Vòng lặp chỉ ở mức mô-đun.
  imports: [AuditModule, DbModule, forwardRef(() => OrdersModule)],
  controllers: [ReturnsController],
  providers: [
    ReturnsService,
    {
      provide: RETURN_STORE,
      useFactory: (db: DbService) => new PostgresReturnStore(db),
      inject: [DbService],
    },
    {
      provide: ORDER_RETURN_GATE,
      useFactory: (store: ReturnStore) => new ReturnGateAdapter(store),
      inject: [RETURN_STORE],
    },
  ],
  exports: [ReturnsService, ORDER_RETURN_GATE],
})
export class ReturnsModule {}
