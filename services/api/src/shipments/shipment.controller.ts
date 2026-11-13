// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
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
  create(
    @Body() body: CreateShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.create(body, req.user);
  }

  @Get()
  list(
    @Query('orderId') orderId?: string,
    @Query('status') status?: ShipmentStatus,
  ): Promise<Shipment[]> {
    return this.shipments.list({
      ...(orderId ? { orderId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Shipment> {
    return this.shipments.get(id);
  }

  @Post(':id/dispatch')
  dispatch(
    @Param('id') id: string,
    @Body() body: DispatchShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.dispatch(id, body, req.user);
  }

  @Post(':id/deliver')
  deliver(
    @Param('id') id: string,
    @Body() body: DeliverShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.deliver(id, body, req.user);
  }

  @Post(':id/fail')
  fail(
    @Param('id') id: string,
    @Body() body: FailShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.fail(id, body, req.user);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() body: CancelShipmentInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Shipment> {
    return this.shipments.cancel(id, body, req.user);
  }
}
