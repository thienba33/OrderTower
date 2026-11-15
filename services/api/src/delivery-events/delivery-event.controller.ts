// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
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
  create(
    @Body() body: CreateDeliveryEventInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeliveryEvent> {
    return this.events.create(body, req.user);
  }

  @Get()
  list(
    @Query('shipmentId') shipmentId?: string,
    @Query('orderId') orderId?: string,
    @Query('type') type?: DeliveryEventType,
  ): Promise<DeliveryEvent[]> {
    return this.events.list({
      ...(shipmentId ? { shipmentId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(type ? { type } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<DeliveryEvent> {
    return this.events.get(id);
  }
}
