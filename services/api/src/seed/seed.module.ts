// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { ReturnsModule } from '../returns/return.module';
import { ShipmentsModule } from '../shipments/shipment.module';
import { HistoricalSeedService } from './historical-seed.service';

@Module({
  // Chỉ nạp dữ liệu, không có controller: HistoricalSeedService chạy lúc
  // API khởi động (OnApplicationBootstrap), sau khi mọi onModuleInit đã
  // nạp xong 8 đơn demo, kho, kênh, xe và tài xế.
  imports: [InventoryModule, OrdersModule, ReturnsModule, ShipmentsModule],
  providers: [HistoricalSeedService],
})
export class SeedModule {}
