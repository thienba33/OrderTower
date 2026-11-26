// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { VehiclesModule } from '../vehicles/vehicle.module';
import { DriversController } from './driver.controller';
import { DriversService } from './driver.service';
import { PostgresDriverStore, DRIVER_STORE } from './driver.store';

@Module({
  imports: [AuditModule, DbModule, VehiclesModule],
  controllers: [DriversController],
  providers: [
    DriversService,
    {
      provide: DRIVER_STORE,
      useFactory: (db: DbService) => new PostgresDriverStore(db),
      inject: [DbService],
    },
  ],
  exports: [DriversService],
})
export class DriversModule {}
