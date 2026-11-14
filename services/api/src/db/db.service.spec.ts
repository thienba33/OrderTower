// SPDX-License-Identifier: Apache-2.0
import { DbService } from './db.service';
import { createTestDbService } from './test-helpers';

describe('DbService', () => {
  it('thiếu DATABASE_URL thì chặn khởi động với lỗi rõ ràng', () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => new DbService()).toThrow('Thiếu biến môi trường DATABASE_URL');
    } finally {
      if (saved !== undefined) {
        process.env.DATABASE_URL = saved;
      }
    }
  });

  it('migration 001, 002, 003 và 004 áp dụng được và chạy lại là không làm gì thêm', async () => {
    const db = await createTestDbService();
    const first = await db.query(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect((first.rows as Array<{ version: string }>).map((row) => row.version)).toEqual([
      '001_init',
      '002_shipments',
      '003_vehicles',
      '004_drivers',
    ]);
    for (const table of [
      'audit_log',
      'workflow_instances',
      'workflow_instance_history',
      'approvals',
      'orders',
      'order_history',
      'inventory',
      'shipments',
      'shipment_history',
      'vehicles',
      'drivers',
      'schema_migrations',
    ]) {
      // Bảng tồn tại khi truy vấn được, dù chưa có hàng nào.
      await expect(db.query(`SELECT 1 FROM ${table} LIMIT 0`)).resolves.toBeDefined();
    }
    // Chạy lại toàn bộ migration: không lỗi, không thêm bản ghi.
    await db.onModuleInit();
    const second = await db.query(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(second.rows).toHaveLength(4);
    expect((second.rows as Array<{ version: string }>).map((row) => row.version)).toEqual([
      '001_init',
      '002_shipments',
      '003_vehicles',
      '004_drivers',
    ]);
  });
});
