// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  SHIPMENT_READ_ROLES,
  SHIPMENT_WRITE_ROLES,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { ShipmentsService } from './shipment.service';
import type {
  CancelShipmentInput,
  CreateShipmentInput,
  DeliverShipmentInput,
  DispatchShipmentInput,
  FailShipmentInput,
  Shipment,
  ShipmentStatus,
} from './shipment.types';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  @Roles(...SHIPMENT_WRITE_ROLES)
  create(
    @Body() body: CreateShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.create(body, req.user);
  }

  @Get()
  @Roles(...SHIPMENT_READ_ROLES)
  list(
    @Req() req: AuthenticatedRequest,
    @Query('orderId') orderId?: string,
    @Query('status') status?: ShipmentStatus,
  ): Promise<Shipment[]> {
    return this.shipments.listForCaller(
      {
        ...(orderId ? { orderId } : {}),
        ...(status ? { status } : {}),
      },
      req.user,
    );
  }

  @Get(':id')
  @Roles(...SHIPMENT_READ_ROLES)
  getOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.getForCaller(id, req.user);
  }

  @Post(':id/dispatch')
  @Roles(...SHIPMENT_WRITE_ROLES)
  dispatch(
    @Param('id') id: string,
    @Body() body: DispatchShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.dispatch(id, body, req.user);
  }

  @Post(':id/deliver')
  @Roles(...SHIPMENT_WRITE_ROLES)
  deliver(
    @Param('id') id: string,
    @Body() body: DeliverShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.deliver(id, body, req.user);
  }

  @Post(':id/fail')
  @Roles(...SHIPMENT_WRITE_ROLES)
  fail(
    @Param('id') id: string,
    @Body() body: FailShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.fail(id, body, req.user);
  }

  @Post(':id/cancel')
  @Roles(...SHIPMENT_WRITE_ROLES)
  cancel(
    @Param('id') id: string,
    @Body() body: CancelShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.cancel(id, body, req.user);
  }
}
