// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  BUSINESS_ROLE,
  ORDER_TRANSITION_ROLES,
  ORDER_VIEW_ROLES,
  ORDER_WRITE_ROLES,
} from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { OrdersService } from './orders.service';
import type {
  CreateOrderInput,
  Order,
  TransitionOrderInput,
  UpdateOrderInput,
} from './orders.types';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(...ORDER_WRITE_ROLES)
  create(
    @Body() body: CreateOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Order> {
    return this.orders.create(body, req.user);
  }

  @Get()
  @Roles(...ORDER_VIEW_ROLES)
  list(
    @Query('channelId') channelId?: string,
    @Query('customerId') customerId?: string,
  ): Promise<Order[]> {
    return this.orders.list({
      ...(channelId ? { channelId } : {}),
      ...(customerId ? { customerId } : {}),
    });
  }

  @Get(':id')
  @Roles(...ORDER_VIEW_ROLES, BUSINESS_ROLE.DRIVER)
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Order> {
    return this.orders.findOneForCaller(id, req.user);
  }

  @Post(':id/transitions')
  @Roles(...ORDER_TRANSITION_ROLES)
  transition(
    @Param('id') id: string,
    @Body() body: TransitionOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Order> {
    return this.orders.transition(id, body, req.user);
  }

  @Patch(':id')
  @Roles(...ORDER_WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body() body: UpdateOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Order> {
    return this.orders.update(id, body, req.user);
  }
}
