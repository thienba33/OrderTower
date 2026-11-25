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

  it('migration 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012 và 013 áp dụng được và chạy lại là không làm gì thêm', async () => {
    const db = await createTestDbService();
    const first = await db.query(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect((first.rows as Array<{ version: string }>).map((row) => row.version)).toEqual([
      '001_init',
      '002_shipments',
      '003_vehicles',
      '004_drivers',
      '005_delivery_events',
      '006_channels',
      '007_returns',
      '008_customers',
      '009_order_fields',
      '010_assignments_call_logs',
      '011_restricted_flags',
      '012_bi',
      '013_tickets',
      '014_files',
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
      'delivery_events',
      'channels',
      'returns',
      'customers',
      'assignments',
      'call_logs',
      'restricted_flags',
      'bi_recommendations',
      'bi_feedback',
      'dx_score_snapshots',
      'tickets',
      'files',
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
    expect(second.rows).toHaveLength(14);
    expect((second.rows as Array<{ version: string }>).map((row) => row.version)).toEqual([
      '001_init',
      '002_shipments',
      '003_vehicles',
      '004_drivers',
      '005_delivery_events',
      '006_channels',
      '007_returns',
      '008_customers',
      '009_order_fields',
      '010_assignments_call_logs',
      '011_restricted_flags',
      '012_bi',
      '013_tickets',
      '014_files',
    ]);
  });
});
