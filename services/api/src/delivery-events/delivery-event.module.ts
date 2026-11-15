// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { PostgresDriverStore, DRIVER_STORE } from '../drivers/driver.store';
import { PostgresShipmentStore, SHIPMENT_STORE } from '../shipments/shipment.store';
import { DeliveryEventsController } from './delivery-event.controller';
import { DeliveryEventsService } from './delivery-event.service';
import {
  PostgresDeliveryEventStore,
  DELIVERY_EVENT_STORE,
} from './delivery-event.store';

@Module({
  // Mô-đun này chỉ nhập AuditModule và DbModule, không nhập
  // ShipmentsModule hay DriversModule: service đọc shipment và tài xế
  // qua kho (store token) chứ không qua service khác, nên đồ thị mô-đun
  // không có vòng lặp và không cần forwardRef ở đâu. Kho shipment và
  // kho tài xế đăng ký lại ở đây bằng cùng lớp Postgres của mô-đun gốc
  // (chỉ là lớp bọc không trạng thái quanh DbService dùng chung), nên
  // ShipmentsModule nhập mô-đun này bằng import thường để ghi sự kiện
  // tự động; xem thêm ở README của mô-đun.
  imports: [AuditModule, DbModule],
  controllers: [DeliveryEventsController],
  providers: [
    DeliveryEventsService,
    {
      provide: DELIVERY_EVENT_STORE,
      useFactory: (db: DbService) => new PostgresDeliveryEventStore(db),
      inject: [DbService],
    },
    {
      provide: SHIPMENT_STORE,
      useFactory: (db: DbService) => new PostgresShipmentStore(db),
      inject: [DbService],
    },
    {
      provide: DRIVER_STORE,
      useFactory: (db: DbService) => new PostgresDriverStore(db),
      inject: [DbService],
    },
  ],
  exports: [DeliveryEventsService],
})
export class DeliveryEventsModule {}
