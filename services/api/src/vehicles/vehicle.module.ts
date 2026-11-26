// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { VehiclesController } from './vehicle.controller';
import { VehiclesService } from './vehicle.service';
import { PostgresVehicleStore, VEHICLE_STORE } from './vehicle.store';

@Module({
  imports: [AuditModule, DbModule],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    {
      provide: VEHICLE_STORE,
      useFactory: (db: DbService) => new PostgresVehicleStore(db),
      inject: [DbService],
    },
  ],
  exports: [VehiclesService],
})
export class VehiclesModule {}
