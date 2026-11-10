// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
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
  create(
    @Body() body: CreateOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Order {
    return this.orders.create(body, req.user);
  }

  @Get()
  list(): Order[] {
    return this.orders.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Order {
    return this.orders.findOne(id);
  }

  @Post(':id/transitions')
  transition(
    @Param('id') id: string,
    @Body() body: TransitionOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Order {
    return this.orders.transition(id, body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Order {
    return this.orders.update(id, body, req.user);
  }
}
