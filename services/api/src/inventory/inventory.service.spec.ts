// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InventoryService } from './inventory.service';

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

  function loadService(): InventoryService {
    const service = new InventoryService();
    service.onModuleInit();
    return service;
  }

  it('nạp seed trong repo: 11 SKU, NM-40 còn 452 chai', () => {
    const service = loadService();
    expect(service.list()).toHaveLength(11);
    expect(service.get('NM-40')).toMatchObject({
      sku: 'NM-40',
      stock: 452,
      reserved: 0,
    });
    expect(service.get('XX-00')).toBeNull();
  });

  it('đủ hàng khi số lượng nhỏ hơn tồn kho', () => {
    const service = loadService();
    expect(
      service.checkSufficient([{ sku: 'NM-40', quantity: 2 }]),
    ).toEqual({ sufficient: true, lacking: [] });
  });

  it('thiếu hàng khi vượt tồn kho hoặc SKU không có', () => {
    const service = loadService();
    const over = service.checkSufficient([{ sku: 'NM-40', quantity: 9999 }]);
    expect(over.sufficient).toBe(false);
    expect(over.lacking[0].available).toBe(452);
    const unknown = service.checkSufficient([{ sku: 'XX-00', quantity: 1 }]);
    expect(unknown.sufficient).toBe(false);
    expect(unknown.lacking[0].available).toBeNull();
  });

  it('giữ hàng trừ kho và tăng số đã giữ', () => {
    const service = loadService();
    service.reserve([{ sku: 'NM-40', quantity: 2 }]);
    expect(service.get('NM-40')).toMatchObject({ stock: 450, reserved: 2 });
    expect(() => service.reserve([{ sku: 'NM-40', quantity: 9999 }])).toThrow(
      'chỉ còn 450',
    );
  });

  it('bản sao trả ra không làm đổi tồn kho trong service', () => {
    const service = loadService();
    const listed = service.list();
    listed[0].stock = 0;
    expect(service.get(listed[0].sku)?.stock).toBeGreaterThan(0);
  });

  it('tệp seed sai hình dạng thì chặn khởi động', () => {
    const path = join(tempDir, 'inventory.test.json');
    writeFileSync(
      path,
      JSON.stringify({
        items: [{ sku: 'NM-40', name: 'Nước mắm', unit: 'chai', stock: -1 }],
      }),
    );
    process.env.INVENTORY_SEED_PATH = path;
    const service = new InventoryService();
    expect(() => service.onModuleInit()).toThrow('số nguyên không âm');
  });
});
