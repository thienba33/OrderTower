// SPDX-License-Identifier: Apache-2.0
import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OrdersModule } from '../orders/orders.module';
import { AddressController } from './address.controller';
import { AddressProposalService } from './address-proposal.service';
import {
  ADDRESS_PROPOSAL_STORE,
  PostgresAddressProposalStore,
} from './address-proposal.store';
import { AddressService } from './address.service';

@Module({
  imports: [
    AuditModule,
    DbModule,
    // Đề xuất chuẩn hóa cần sửa đơn qua OrdersService, đơn lại chấm điểm
    // địa chỉ qua AddressService nên hai mô-đun tham chiếu nhau; cả hai
    // phía đều dùng forwardRef, giống cặp OrdersModule - ShipmentsModule.
    forwardRef(() => OrdersModule),
  ],
  controllers: [AddressController],
  providers: [
    AddressService,
    AddressProposalService,
    {
      provide: ADDRESS_PROPOSAL_STORE,
      useFactory: (db: DbService) => new PostgresAddressProposalStore(db),
      inject: [DbService],
    },
  ],
  exports: [AddressService, AddressProposalService],
})
export class AddressModule {}
