// SPDX-License-Identifier: Apache-2.0
import { AuditService } from './audit.service';
import { InMemoryAuditStore, PostgresAuditStore } from './audit.store';
import { createTestDbService } from '../db/test-helpers';

function recordInput(orderId: string, from: string | null, to: string) {
  return {
    actor: 'son',
    role: 'Điều phối viên',
    action: 'transition',
    orderId,
    from,
    to,
    detail: '',
  };
}

describe('AuditService', () => {
  it('chuỗi rỗng kiểm chứng hợp lệ', async () => {
    const audit = new AuditService();
    expect(await audit.verify()).toEqual({
      valid: true,
      checked: 0,
      brokenAt: null,
    });
    expect(await audit.getAll()).toEqual([]);
  });

  it('nối hash: bản ghi sau trỏ tới hash bản ghi trước', async () => {
    const audit = new AuditService();
    const first = await audit.append(recordInput('DH-1', null, 'Mới tạo'));
    const second = await audit.append(
      recordInput('DH-1', 'Mới tạo', 'Đã kiểm tra'),
    );
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(first.prevHash).toBe('0'.repeat(64));
    expect(second.prevHash).toBe(first.hash);
    expect(await audit.verify()).toEqual({
      valid: true,
      checked: 2,
      brokenAt: null,
    });
  });

  it('phát hiện bản ghi đã sửa', async () => {
    const store = new InMemoryAuditStore();
    const audit = new AuditService(store);
    await audit.append(recordInput('DH-1', null, 'Mới tạo'));
    await audit.append(recordInput('DH-1', 'Mới tạo', 'Đã kiểm tra'));
    await audit.append(recordInput('DH-1', 'Đã kiểm tra', 'Chờ kho'));
    // Giả lập sửa trực tiếp trong kho lưu, như kẻ sửa log.
    const internals = store as unknown as { records: Array<{ to: string }> };
    internals.records[1].to = 'Đã giao';
    const result = await audit.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('bản ghi trả ra là bản sao, sửa ngoài không làm hỏng chuỗi', async () => {
    const audit = new AuditService();
    await audit.append(recordInput('DH-1', null, 'Mới tạo'));
    const listed = await audit.getAll();
    listed[0].to = 'Đã giao';
    expect((await audit.verify()).valid).toBe(true);
  });
});

describe('PostgresAuditStore', () => {
  it('ghi rồi đọc lại giống hệt, chuỗi hash còn nguyên', async () => {
    const db = await createTestDbService();
    const store = new PostgresAuditStore(db);
    const audit = new AuditService(store);
    const first = await audit.append(recordInput('DH-1', null, 'Mới tạo'));
    const second = await audit.append(
      recordInput('DH-1', 'Mới tạo', 'Đã kiểm tra'),
    );
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(first.hash);
    const listed = await audit.getAll();
    expect(listed).toHaveLength(2);
    expect(listed[1]).toEqual(second);
    expect(await audit.verify()).toEqual({
      valid: true,
      checked: 2,
      brokenAt: null,
    });
    // Mở lại kho trên cùng DB: chuỗi vẫn còn, số thứ tự không quay về 1.
    const reopened = new AuditService(new PostgresAuditStore(db));
    const third = await reopened.append(
      recordInput('DH-1', 'Đã kiểm tra', 'Chờ kho'),
    );
    expect(third.seq).toBe(3);
    expect(third.prevHash).toBe(second.hash);
    expect(await reopened.verify()).toEqual({
      valid: true,
      checked: 3,
      brokenAt: null,
    });
  });

  it('sửa 1 hàng trực tiếp trong DB thì verify() phát hiện', async () => {
    const db = await createTestDbService();
    const store = new PostgresAuditStore(db);
    const audit = new AuditService(store);
    await audit.append(recordInput('DH-1', null, 'Mới tạo'));
    await audit.append(recordInput('DH-1', 'Mới tạo', 'Đã kiểm tra'));
    await db.query(
      'UPDATE audit_log SET detail = $1 WHERE seq = $2',
      ['đã sửa lén', 2],
    );
    const result = await audit.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });
});
