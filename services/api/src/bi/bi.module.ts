// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approval.module';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { ReturnsModule } from '../returns/return.module';
import { BiController } from './bi.controller';
import { BiLineageController } from './bi-lineage.controller';
import { BiLineageService } from './bi-lineage.service';
import { BiService } from './bi.service';
import { BI_STORE, PostgresBiStore } from './bi.store';

// Lớp BI pilot (mục 3 bản dự thảo): dự báo nhu cầu, phát hiện bất thường,
// đề xuất hành động kèm đầu vào rõ ràng, duyệt tay, tính DX-Score v1 từ
// log. Chỉ đọc dữ liệu đơn/kho/trả hàng qua service hiện có; kho riêng
// chỉ lưu bản ghi của BI (đề xuất, phản hồi, snapshot DX-Score).
@Module({
  imports: [
    DbModule,
    OrdersModule,
    InventoryModule,
    ReturnsModule,
    AuditModule,
    ApprovalsModule,
  ],
  controllers: [BiController, BiLineageController],
  providers: [
    BiService,
    BiLineageService,
    {
      provide: BI_STORE,
      useFactory: (db: DbService) => new PostgresBiStore(db),
      inject: [DbService],
    },
  ],
  exports: [BiService],
})
export class BiModule {}
