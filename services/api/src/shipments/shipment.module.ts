// SPDX-License-Identifier: Apache-2.0
import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { ORDER_SHIPMENT_GATE } from '../orders/order-shipment-gate';
import { OrdersModule } from '../orders/orders.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ShipmentGateAdapter } from './shipment-gate.adapter';
import { ShipmentsController } from './shipment.controller';
import { ShipmentsService } from './shipment.service';
import {
  PostgresShipmentStore,
  SHIPMENT_STORE,
} from './shipment.store';
import type { ShipmentStore } from './shipment.types';

@Module({
  // forwardRef với OrdersModule: shipment cần chuyển đơn, đơn cần cổng đọc
  // shipment (xem OrdersModule). Vòng lặp chỉ ở mức mô-đun.
  imports: [
    AuditModule,
    DbModule,
    forwardRef(() => OrdersModule),
    WorkflowModule,
  ],
  controllers: [ShipmentsController],
  providers: [
    ShipmentsService,
    {
      provide: SHIPMENT_STORE,
      useFactory: (db: DbService) => new PostgresShipmentStore(db),
      inject: [DbService],
    },
    {
      provide: ORDER_SHIPMENT_GATE,
      useFactory: (store: ShipmentStore) =>
        new ShipmentGateAdapter(store),
      inject: [SHIPMENT_STORE],
    },
  ],
  exports: [ShipmentsService, ORDER_SHIPMENT_GATE],
})
export class ShipmentsModule {}
