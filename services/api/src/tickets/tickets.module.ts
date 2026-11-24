// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { PostgresTicketStore, TICKET_STORE } from './tickets.store';

// Ticket CSKH: bảng ticket, 4 KPI đầu màn CSKH, đổi trạng thái xuôi từng
// bước. Mã đơn là chuỗi tự do, không kiểm tra đơn có thật, nên mô-đun
// này không nhập OrdersModule (xem tickets.types.ts).
@Module({
  imports: [AuditModule, DbModule],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    {
      provide: TICKET_STORE,
      useFactory: (db: DbService) => new PostgresTicketStore(db),
      inject: [DbService],
    },
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
