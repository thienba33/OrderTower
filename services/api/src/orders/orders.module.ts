// SPDX-License-Identifier: Apache-2.0
import { forwardRef, Module } from '@nestjs/common';
import { AddressModule } from '../address/address.module';
import { ApprovalsModule } from '../approvals/approval.module';
import { AuditModule } from '../audit/audit.module';
import { ChannelsModule } from '../channels/channel.module';
import { CustomersModule } from '../customers/customer.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { DriversModule } from '../drivers/driver.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ReturnsModule } from '../returns/return.module';
import { ShipmentsModule } from '../shipments/shipment.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ORDER_STORE, PostgresOrderStore } from './orders.store';

@Module({
  imports: [
    // Đề xuất chuẩn hóa địa chỉ cần sửa đơn qua OrdersService, đơn lại
    // chấm điểm địa chỉ qua AddressService nên hai mô-đun tham chiếu nhau;
    // cả hai phía đều dùng forwardRef, giống cặp OrdersModule -
    // ShipmentsModule ở dưới.
    forwardRef(() => AddressModule),
    ApprovalsModule,
    AuditModule,
    ChannelsModule,
    CustomersModule,
    DbModule,
    DriversModule,
    InventoryModule,
    OutboxModule,
    WorkflowModule,
    // Lấy cổng đọc shipment từ ShipmentsModule. Hai mô-đun tham chiếu nhau
    // (đơn cần bằng chứng shipment, shipment cần chuyển đơn) nên cả hai
    // phía đều dùng forwardRef; vòng lặp chỉ ở mức mô-đun, mức service
    // không lặp vì cổng đọc qua kho, không qua ShipmentsService.
    forwardRef(() => ShipmentsModule),
    // Lấy cổng đọc trả hàng từ ReturnsModule. Hai mô-đun tham chiếu nhau
    // (đơn cần trả hàng đã duyệt để đóng đơn, trả hàng cần kiểm tra đơn)
    // nên cả hai phía đều dùng forwardRef; vòng lặp chỉ ở mức mô-đun,
    // mức service không lặp vì cổng đọc qua kho, không qua ReturnsService.
    forwardRef(() => ReturnsModule),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    {
      provide: ORDER_STORE,
      useFactory: (db: DbService) => new PostgresOrderStore(db),
      inject: [DbService],
    },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
