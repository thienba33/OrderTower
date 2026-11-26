// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { CustomersController } from './customer.controller';
import { CustomersService } from './customer.service';
import { PostgresCustomerStore, CUSTOMER_STORE } from './customer.store';

@Module({
  imports: [AuditModule, DbModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    {
      provide: CUSTOMER_STORE,
      useFactory: (db: DbService) => new PostgresCustomerStore(db),
      inject: [DbService],
    },
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
