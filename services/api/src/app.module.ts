// SPDX-License-Identifier: Apache-2.0
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { ApprovalsModule } from './approvals/approval.module';
import { AssignmentModule } from './assignments/assignment.module';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { RolesGuard } from './auth/roles.guard';
import { BiModule } from './bi/bi.module';
import { ChannelsModule } from './channels/channel.module';
import { CustomersModule } from './customers/customer.module';
import { DeliveryEventsModule } from './delivery-events/delivery-event.module';
import { DriversModule } from './drivers/driver.module';
import { ObservabilityModule } from './observability/observability.module';
import { RequestLoggingMiddleware } from './observability/request-logging.middleware';
import { OrdersModule } from './orders/orders.module';
import { PublicTrackingModule } from './public-tracking/public-tracking.module';
import { RestrictedFlagModule } from './restricted-flags/restricted-flag.module';
import { ReturnsModule } from './returns/return.module';
import { SeedModule } from './seed/seed.module';
import { ShipmentsModule } from './shipments/shipment.module';
import { StorageModule } from './storage/storage.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantContextInterceptor } from './tenant/tenant.interceptor';
import { TicketsModule } from './tickets/tickets.module';
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
    ObservabilityModule,
    OrdersModule,
    PublicTrackingModule,
    RestrictedFlagModule,
    ReturnsModule,
    SeedModule,
    ShipmentsModule,
    StorageModule,
    TelemetryModule,
    TenantModule,
    TicketsModule,
    VehiclesModule,
    WorkflowModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
