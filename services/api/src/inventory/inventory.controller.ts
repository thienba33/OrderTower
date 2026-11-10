// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import type { InventoryItem } from './inventory.types';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(): InventoryItem[] {
    return this.inventory.list();
  }

  @Get(':sku')
  getOne(@Param('sku') sku: string): InventoryItem {
    const item = this.inventory.get(sku);
    if (!item) {
      throw new NotFoundException(`Không tìm thấy SKU ${sku} trong kho.`);
    }
    return item;
  }
}
