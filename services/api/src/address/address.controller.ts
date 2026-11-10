// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AddressService } from './address.service';
import type { AddressEvaluation, AddressInput } from './address.types';

const ADDRESS_FIELDS: Array<keyof AddressInput> = [
  'province',
  'district',
  'ward',
  'street',
];

@Controller('address')
export class AddressController {
  constructor(private readonly address: AddressService) {}

  @Post('evaluate')
  evaluate(@Body() body: AddressInput): AddressEvaluation {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('body phải là 1 object địa chỉ.');
    }
    for (const field of ADDRESS_FIELDS) {
      const value = body[field];
      if (value !== undefined && typeof value !== 'string') {
        throw new BadRequestException(`${field} phải là dạng chuỗi khi có.`);
      }
    }
    return this.address.evaluate(body);
  }
}
