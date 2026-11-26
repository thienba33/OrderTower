// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  DELIVERY_EVENT_READ_ROLES,
  DELIVERY_EVENT_WRITE_ROLES,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { DeliveryEventsService } from './delivery-event.service';
import type {
  CreateDeliveryEventInput,
  DeliveryEvent,
  DeliveryEventType,
} from './delivery-event.types';

@Controller('delivery-events')
export class DeliveryEventsController {
  constructor(private readonly events: DeliveryEventsService) {}

  @Post()
  @Roles(...DELIVERY_EVENT_WRITE_ROLES)
  create(
    @Body() body: CreateDeliveryEventInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeliveryEvent> {
    return this.events.create(body, req.user);
  }

  @Get()
  @Roles(...DELIVERY_EVENT_READ_ROLES)
  list(
    @Req() req: AuthenticatedRequest,
    @Query('shipmentId') shipmentId?: string,
    @Query('orderId') orderId?: string,
    @Query('type') type?: DeliveryEventType,
  ): Promise<DeliveryEvent[]> {
    return this.events.listForCaller(
      {
        ...(shipmentId ? { shipmentId } : {}),
        ...(orderId ? { orderId } : {}),
        ...(type ? { type } : {}),
      },
      req.user,
    );
  }

  @Get(':id')
  @Roles(...DELIVERY_EVENT_READ_ROLES)
  getOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeliveryEvent> {
    return this.events.getForCaller(id, req.user);
  }
}
