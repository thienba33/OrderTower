// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDbService } from '../db/test-helpers';
import { InventoryService } from './inventory.service';
import { PostgresInventoryStore } from './inventory.store';

describe('InventoryService', () => {
  const originalSeedPath = process.env.INVENTORY_SEED_PATH;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'inventory-test-'));
  });

  afterEach(() => {
    if (originalSeedPath === undefined) {
      delete process.env.INVENTORY_SEED_PATH;
    } else {
      process.env.INVENTORY_SEED_PATH = originalSeedPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function loadService(): Promise<InventoryService> {
    const service = new InventoryService();
    await service.onModuleInit();
    return service;
  }

  it('nạp seed trong repo: 11 SKU, NM-40 còn 452 chai', async () => {
    const service = await loadService();
    expect(await service.list()).toHaveLength(11);
    expect(await service.get('NM-40')).toMatchObject({
      sku: 'NM-40',
      stock: 452,
      reserved: 0,
    });
    expect(await service.get('XX-00')).toBeNull();
  });

  it('đủ hàng khi số lượng nhỏ hơn tồn kho', async () => {
    const service = await loadService();
    expect(
      await service.checkSufficient([{ sku: 'NM-40', quantity: 2 }]),
    ).toEqual({ sufficient: true, lacking: [] });
  });

  it('thiếu hàng khi vượt tồn kho hoặc SKU không có', async () => {
    const service = await loadService();
    const over = await service.checkSufficient([{ sku: 'NM-40', quantity: 9999 }]);
    expect(over.sufficient).toBe(false);
    expect(over.lacking[0].available).toBe(452);
    const unknown = await service.checkSufficient([{ sku: 'XX-00', quantity: 1 }]);
    expect(unknown.sufficient).toBe(false);
    expect(unknown.lacking[0].available).toBeNull();
  });

  it('giữ hàng trừ kho và tăng số đã giữ', async () => {
    const service = await loadService();
    await service.reserve([{ sku: 'NM-40', quantity: 2 }]);
    expect(await service.get('NM-40')).toMatchObject({ stock: 450, reserved: 2 });
    await expect(
      service.reserve([{ sku: 'NM-40', quantity: 9999 }]),
    ).rejects.toThrow('chỉ còn 450');
  });

  it('bản sao trả ra không làm đổi tồn kho trong service', async () => {
    const service = await loadService();
    const listed = await service.list();
    listed[0].stock = 0;
    expect((await service.get(listed[0].sku))?.stock).toBeGreaterThan(0);
  });

  it('tệp seed sai hình dạng thì chặn khởi động', async () => {
    const path = join(tempDir, 'inventory.test.json');
    writeFileSync(
      path,
      JSON.stringify({
        items: [{ sku: 'NM-40', name: 'Nước mắm', unit: 'chai', stock: -1 }],
      }),
    );
    process.env.INVENTORY_SEED_PATH = path;
    const service = new InventoryService();
    await expect(service.onModuleInit()).rejects.toThrow('số nguyên không âm');
  });
});

describe('PostgresInventoryStore', () => {
  it('nạp seed khi bảng trống, lần 2 không đặt lại số lượng', async () => {
    const db = await createTestDbService();
    const service = new InventoryService(new PostgresInventoryStore(db));
    await service.onModuleInit();
    expect((await service.list())).toHaveLength(11);
    expect(await service.get('NM-40')).toMatchObject({
      sku: 'NM-40',
      name: 'Nước mắm 40 độ 500ml',
      unit: 'chai',
      stock: 452,
      reserved: 0,
    });
    await service.reserve([{ sku: 'NM-40', quantity: 2 }]);
    // Khởi động lại trên cùng DB: không nạp lại seed, không đặt lại kho.
    await service.onModuleInit();
    expect((await service.list())).toHaveLength(11);
    expect(await service.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
  });

  it('giữ hàng còn nguyên sau khi mở service mới trên cùng DB', async () => {
    const db = await createTestDbService();
    const store = new PostgresInventoryStore(db);
    const first = new InventoryService(store);
    await first.onModuleInit();
    await first.reserve([{ sku: 'NM-40', quantity: 2 }]);
    const second = new InventoryService(store);
    await second.onModuleInit();
    expect(await second.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
  });

  it('tệp seed sai thì chặn khởi động cả khi dùng kho Postgres', async () => {
    const db = await createTestDbService();
    const path = join(
      mkdtempSync(join(tmpdir(), 'inventory-pg-test-')),
      'bad.json',
    );
    writeFileSync(
      path,
      JSON.stringify({
        items: [{ sku: 'NM-40', name: 'Nước mắm', unit: 'chai', stock: -1 }],
      }),
    );
    process.env.INVENTORY_SEED_PATH = path;
    try {
      const service = new InventoryService(new PostgresInventoryStore(db));
      await expect(service.onModuleInit()).rejects.toThrow(
        'số nguyên không âm',
      );
    } finally {
      delete process.env.INVENTORY_SEED_PATH;
    }
  });
});
