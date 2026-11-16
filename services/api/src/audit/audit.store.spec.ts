// SPDX-License-Identifier: Apache-2.0
import { PostgresAuditStore, mapAuditRow } from './audit.store';
import type { Queryable, Transactional } from '../db/db.types';

function recordInput() {
  return {
    actor: 'seed',
    role: 'Quản trị viên',
    action: 'order.created',
    orderId: 'DH-1001',
    from: null,
    to: 'Mới tạo',
    detail: '',
  };
}

// Kho giả lập đúng hành vi của pg thật: cột BIGINT trả về dạng chuỗi.
// pg-mem trong kiểm thử trả về dạng số nên không bắt được lỗi nối chuỗi.
function makeFakeDb(selectRows: unknown[]) {
  const inserts: unknown[][] = [];
  const client: Queryable = {
    query: async (text: string, params?: unknown[]) => {
      if (text.includes('INSERT INTO audit_log')) {
        inserts.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      return { rows: selectRows, rowCount: selectRows.length };
    },
  };
  const db: Transactional = {
    query: async (text: string, params?: unknown[]) => client.query(text, params),
    withTransaction: async <T>(fn: (c: Queryable) => Promise<T>) => fn(client),
  };
  return { db, inserts };
}

describe('PostgresAuditStore', () => {
  it('seq dạng chuỗi như pg thật vẫn tăng đúng số, không nối chuỗi', async () => {
    const { db, inserts } = makeFakeDb([
      { seq: '5', hash: 'f'.repeat(64) },
    ]);
    const store = new PostgresAuditStore(db);
    const record = await store.append(recordInput());
    expect(record.seq).toBe(6);
    expect(typeof record.seq).toBe('number');
    expect(record.prevHash).toBe('f'.repeat(64));
    // Giá trị chèn vào cột seq phải là số 6, không phải chuỗi "51".
    expect(inserts).toHaveLength(1);
    expect(inserts[0][0]).toBe(6);
    expect(typeof inserts[0][0]).toBe('number');
  });

  it('bảng rỗng thì bản ghi đầu có seq 1', async () => {
    const { db, inserts } = makeFakeDb([]);
    const store = new PostgresAuditStore(db);
    const record = await store.append(recordInput());
    expect(record.seq).toBe(1);
    expect(record.prevHash).toBe('0'.repeat(64));
    expect(inserts[0][0]).toBe(1);
  });

  it('getAll ép seq chuỗi về số', async () => {
    const { db } = makeFakeDb([
      {
        seq: '7',
        at: '2026-11-16T00:00:00.000Z',
        actor: 'seed',
        role: 'Quản trị viên',
        action: 'order.created',
        order_id: 'DH-1001',
        from_state: null,
        to_state: 'Mới tạo',
        detail: '',
        prev_hash: '0'.repeat(64),
        hash: 'a'.repeat(64),
      },
    ]);
    const store = new PostgresAuditStore(db);
    const records = await store.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].seq).toBe(7);
    expect(typeof records[0].seq).toBe('number');
  });

  it('mapAuditRow ép seq chuỗi về số', () => {
    const record = mapAuditRow({
      seq: '12',
      at: new Date('2026-11-16T00:00:00.000Z'),
      actor: 'seed',
      role: 'Quản trị viên',
      action: 'order.created',
      order_id: 'DH-1001',
      from_state: null,
      to_state: 'Mới tạo',
      detail: '',
      prev_hash: '0'.repeat(64),
      hash: 'a'.repeat(64),
    });
    expect(record.seq).toBe(12);
    expect(typeof record.seq).toBe('number');
  });
});
