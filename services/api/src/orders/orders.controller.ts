// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type {
  CreateOrderInput,
  Order,
  TransitionOrderInput,
} from './orders.types';

// Actor và role hiện lấy từ body, sẽ thay bằng thông tin từ token Keycloak
// khi tích hợp xác thực ở API.
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderInput): Order {
    return this.orders.create(body);
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
  ): Order {
    return this.orders.transition(id, body);
  }
}
