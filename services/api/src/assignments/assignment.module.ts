// SPDX-License-Identifier: Apache-2.0
import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OrdersModule } from '../orders/orders.module';
import { AssignmentsController, CallLogsController } from './assignment.controller';
import { AssignmentsService, CallLogsService } from './assignment.service';
import {
  ASSIGNMENT_STORE,
  CALL_LOG_STORE,
  PostgresAssignmentStore,
  PostgresCallLogStore,
} from './assignment.store';

@Module({
  // forwardRef với OrdersModule: phân đơn cần kiểm tra đơn có thật.
  // Vòng lặp chỉ ở mức mô-đun, giống ReturnsModule.
  imports: [AuditModule, DbModule, forwardRef(() => OrdersModule)],
  controllers: [AssignmentsController, CallLogsController],
  providers: [
    AssignmentsService,
    CallLogsService,
    {
      provide: ASSIGNMENT_STORE,
      useFactory: (db: DbService) => new PostgresAssignmentStore(db),
      inject: [DbService],
    },
    {
      provide: CALL_LOG_STORE,
      useFactory: (db: DbService) => new PostgresCallLogStore(db),
      inject: [DbService],
    },
  ],
  exports: [AssignmentsService, CallLogsService],
})
export class AssignmentModule {}
