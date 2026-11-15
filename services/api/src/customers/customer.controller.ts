// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { CustomersService } from './customer.service';
import type { CreateCustomerInput, Customer } from './customer.types';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(
    @Body() body: CreateCustomerInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<Customer> {
    return this.customers.create(body, req.user);
  }

  @Get()
  list(@Query('phone') phone?: string): Promise<Customer[]> {
    return this.customers.list({
      ...(phone ? { phone } : {}),
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Customer> {
    return this.customers.get(id);
  }
}
