// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type {
  InventoryItem,
  InventorySeedItem,
  StockCheck,
} from './inventory.types';
import type { OrderItem } from '../orders/orders.types';
import { INVENTORY_STORE, InMemoryInventoryStore } from './inventory.store';
import type { InventoryStore } from './inventory.store';

// Tên tệp seed mặc định. Đổi tệp seed rồi khởi động lại thì kho mới có hiệu lực.
const DEFAULT_SEED_FILE = 'inventory.seed.json';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Tồn kho theo SKU, nạp từ tệp seed. Kho mặc định là Postgres (xem
// inventory.module.ts); bộ nhớ chỉ dùng khi khởi tạo thủ công trong kiểm thử.
// Tệp seed là nguồn sự thật: khi bảng inventory còn trống thì nạp seed vào,
// khi đã có dữ liệu thì giữ nguyên, khởi động lại không đặt lại số lượng.
@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly logger = new Logger(InventoryService.name);

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị cũ không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    @Optional()
    @Inject(INVENTORY_STORE)
    private readonly store: InventoryStore = new InMemoryInventoryStore(),
  ) {}

  async onModuleInit(): Promise<void> {
    // Đọc và kiểm tra seed trước: tệp seed sai vẫn chặn khởi động, dù kho
    // đã có dữ liệu.
    const seed = this.loadSeed();
    const existing = await this.store.list();
    if (existing.length > 0) {
      this.logger.log(
        `Kho đã có ${existing.length} SKU trong DB, giữ nguyên dữ liệu.`,
      );
      return;
    }
    for (const item of seed) {
      await this.store.save({ ...item, reserved: 0 });
    }
    this.logger.log(`Đã nạp tồn kho ${seed.length} SKU từ tệp seed.`);
  }

  resolveSeedPath(): string {
    if (process.env.INVENTORY_SEED_PATH) {
      return process.env.INVENTORY_SEED_PATH;
    }
    return join(__dirname, 'data', DEFAULT_SEED_FILE);
  }

  async list(): Promise<InventoryItem[]> {
    return this.store.list();
  }

  async get(sku: string): Promise<InventoryItem | null> {
    return this.store.get(sku);
  }

  // Kiểm tra đủ hàng cho các mặt hàng của 1 đơn, chưa trừ kho.
  async checkSufficient(items: OrderItem[]): Promise<StockCheck> {
    const lacking: StockCheck['lacking'] = [];
    for (const item of items) {
      const held = await this.store.get(item.sku);
      if (!held) {
        lacking.push({
          sku: item.sku,
          needed: item.quantity,
          available: null,
          reason: `SKU ${item.sku} không có trong kho.`,
        });
      } else if (item.quantity > held.stock) {
        lacking.push({
          sku: item.sku,
          needed: item.quantity,
          available: held.stock,
          reason: `SKU ${item.sku} cần ${item.quantity} ${held.unit}, kho chỉ còn ${held.stock} ${held.unit}.`,
        });
      }
    }
    return { sufficient: lacking.length === 0, lacking };
  }

  // Giữ hàng cho 1 đơn. Chỉ gọi sau khi checkSufficient đã đạt.
  async reserve(items: OrderItem[]): Promise<void> {
    for (const item of items) {
      const held = await this.store.get(item.sku);
      if (!held) {
        throw new Error(`Không giữ được hàng: SKU ${item.sku} không có trong kho.`);
      }
      if (item.quantity > held.stock) {
        throw new Error(
          `Không giữ được hàng: SKU ${item.sku} cần ${item.quantity}, kho chỉ còn ${held.stock}.`,
        );
      }
      held.stock -= item.quantity;
      held.reserved += item.quantity;
      await this.store.save(held);
    }
  }

  private loadSeed(): InventorySeedItem[] {
    const path = this.resolveSeedPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp seed tồn kho tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp seed tồn kho tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`);
    }
    const items = (parsed as Record<string, unknown>).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: items phải là mảng không rỗng.`);
    }
    const seen = new Set<string>();
    for (const item of items as unknown[]) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: mỗi item phải là 1 object.`);
      }
      const entry = item as Record<string, unknown>;
      if (!isNonEmptyString(entry.sku)) {
        throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: mỗi item cần sku dạng chuỗi.`);
      }
      if (!isNonEmptyString(entry.name)) {
        throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: mỗi item cần name dạng chuỗi.`);
      }
      if (!isNonEmptyString(entry.unit)) {
        throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: mỗi item cần unit dạng chuỗi.`);
      }
      if (!Number.isInteger(entry.stock) || (entry.stock as number) < 0) {
        throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: stock của ${String(entry.sku)} phải là số nguyên không âm.`);
      }
      if (seen.has(entry.sku as string)) {
        throw new Error(`Tệp seed tồn kho tại ${path} không hợp lệ: SKU ${String(entry.sku)} bị trùng.`);
      }
      seen.add(entry.sku as string);
    }
    return items as InventorySeedItem[];
  }
}
