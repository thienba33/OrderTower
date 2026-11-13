// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OrdersModule } from '../orders/orders.module';
import { ShipmentsController } from './shipment.controller';
import { ShipmentsService } from './shipment.service';
import { PostgresShipmentStore, SHIPMENT_STORE } from './shipment.store';

@Module({
  imports: [AuditModule, DbModule, OrdersModule],
  controllers: [ShipmentsController],
  providers: [
    ShipmentsService,
    {
      provide: SHIPMENT_STORE,
      useFactory: (db: DbService) => new PostgresShipmentStore(db),
      inject: [DbService],
    },
  ],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
