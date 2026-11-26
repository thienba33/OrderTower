// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DeliveryEventsModule } from '../delivery-events/delivery-event.module';
import { DriversModule } from '../drivers/driver.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { ShipmentsModule } from '../shipments/shipment.module';
import { VehiclesModule } from '../vehicles/vehicle.module';
import { PublicTrackingController } from './public-tracking.controller';
import { PublicTrackingService } from './public-tracking.service';

@Module({
  // Chỉ đọc qua service khác, không ghi gì và không có kho riêng. Không
  // mô-đun nào nhập lại mô-đun này nên không cần forwardRef, dù
  // OrdersModule và ShipmentsModule tham chiếu nhau (vòng đó đã giải
  // bằng forwardRef ở hai phía).
  imports: [
    OrdersModule,
    ShipmentsModule,
    DeliveryEventsModule,
    DriversModule,
    VehiclesModule,
    InventoryModule,
  ],
  controllers: [PublicTrackingController],
  providers: [PublicTrackingService],
  exports: [PublicTrackingService],
})
export class PublicTrackingModule {}
