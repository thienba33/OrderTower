// SPDX-License-Identifier: Apache-2.0
import { AuditService } from './audit.service';

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
  it('chuỗi rỗng kiểm chứng hợp lệ', () => {
    const audit = new AuditService();
    expect(audit.verify()).toEqual({ valid: true, checked: 0, brokenAt: null });
    expect(audit.getAll()).toEqual([]);
  });

  it('nối hash: bản ghi sau trỏ tới hash bản ghi trước', () => {
    const audit = new AuditService();
    const first = audit.append(recordInput('DH-1', null, 'Mới tạo'));
    const second = audit.append(recordInput('DH-1', 'Mới tạo', 'Đã kiểm tra'));
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(first.prevHash).toBe('0'.repeat(64));
    expect(second.prevHash).toBe(first.hash);
    expect(audit.verify()).toEqual({ valid: true, checked: 2, brokenAt: null });
  });

  it('phát hiện bản ghi đã sửa', () => {
    const audit = new AuditService();
    audit.append(recordInput('DH-1', null, 'Mới tạo'));
    audit.append(recordInput('DH-1', 'Mới tạo', 'Đã kiểm tra'));
    audit.append(recordInput('DH-1', 'Đã kiểm tra', 'Chờ kho'));
    // Giả lập sửa trực tiếp trong kho lưu, như kẻ sửa log.
    const internals = audit as unknown as { records: Array<{ to: string }> };
    internals.records[1].to = 'Đã giao';
    const result = audit.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('bản ghi trả ra là bản sao, sửa ngoài không làm hỏng chuỗi', () => {
    const audit = new AuditService();
    audit.append(recordInput('DH-1', null, 'Mới tạo'));
    const listed = audit.getAll();
    listed[0].to = 'Đã giao';
    expect(audit.verify().valid).toBe(true);
  });
});
