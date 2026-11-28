// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { INVENTORY_READ_ROLES, INVENTORY_WRITE_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { InventoryService } from './inventory.service';
import type { InventoryItem, RestockInput } from './inventory.types';

@Controller('inventory')
@Roles(...INVENTORY_READ_ROLES)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(): Promise<InventoryItem[]> {
    return this.inventory.list();
  }

  @Get(':sku')
  async getOne(@Param('sku') sku: string): Promise<InventoryItem> {
    const item = await this.inventory.get(sku);
    if (!item) {
      throw new NotFoundException(`Không tìm thấy SKU ${sku} trong kho.`);
    }
    return item;
  }

  // Nhập thêm hàng: chỉ nhân viên kho, quản lý và quản trị viên. Vai trò
  // ghi ở mức handler nên thắng vai đọc ở mức controller (RolesGuard dùng
  // getAllAndOverride, handler trước, class sau).
  @Post(':sku/restock')
  @Roles(...INVENTORY_WRITE_ROLES)
  restock(
    @Param('sku') sku: string,
    @Body() body: RestockInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<InventoryItem> {
    return this.inventory.restock(sku, body, req.user);
  }
}
