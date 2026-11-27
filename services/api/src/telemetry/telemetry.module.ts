// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { DriversModule } from '../drivers/driver.module';
import { ShipmentsModule } from '../shipments/shipment.module';
import { VehiclesModule } from '../vehicles/vehicle.module';
import {
  NgsiLdController,
  TelemetryController,
  TwinController,
} from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import {
  PostgresTelemetryStore,
  TELEMETRY_STORE,
} from './telemetry.store';

@Module({
  imports: [
    AuditModule,
    DbModule,
    DriversModule,
    ShipmentsModule,
    VehiclesModule,
  ],
  controllers: [TelemetryController, TwinController, NgsiLdController],
  providers: [
    TelemetryService,
    {
      provide: TELEMETRY_STORE,
      useFactory: (db: DbService) => new PostgresTelemetryStore(db),
      inject: [DbService],
    },
  ],
  exports: [TelemetryService],
})
export class TelemetryModule {}
