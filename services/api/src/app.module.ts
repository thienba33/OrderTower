// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { ApprovalsModule } from './approvals/approval.module';
import { AssignmentModule } from './assignments/assignment.module';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { BiModule } from './bi/bi.module';
import { ChannelsModule } from './channels/channel.module';
import { CustomersModule } from './customers/customer.module';
import { DeliveryEventsModule } from './delivery-events/delivery-event.module';
import { DriversModule } from './drivers/driver.module';
import { OrdersModule } from './orders/orders.module';
import { PublicTrackingModule } from './public-tracking/public-tracking.module';
import { RestrictedFlagModule } from './restricted-flags/restricted-flag.module';
import { ReturnsModule } from './returns/return.module';
import { SeedModule } from './seed/seed.module';
import { ShipmentsModule } from './shipments/shipment.module';
import { VehiclesModule } from './vehicles/vehicle.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [
    ApprovalsModule,
    AssignmentModule,
    AuditModule,
    AuthModule,
    BiModule,
    ChannelsModule,
    CustomersModule,
    DeliveryEventsModule,
    DriversModule,
    OrdersModule,
    PublicTrackingModule,
    RestrictedFlagModule,
    ReturnsModule,
    SeedModule,
    ShipmentsModule,
    VehiclesModule,
    WorkflowModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
