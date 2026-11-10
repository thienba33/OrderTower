// SPDX-License-Identifier: Apache-2.0
import type { Caller } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { ApprovalService } from './approval.service';
import { InMemoryApprovalStore } from './approval.store';

const COORDINATOR: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};
const MANAGER: Caller = {
  userId: 'user-quanly',
  username: 'quan-ly',
  roles: ['Quản lý'],
};
const DRIVER: Caller = {
  userId: 'user-nam',
  username: 'nam',
  roles: ['Tài xế'],
};

function buildServices(): { approvals: ApprovalService; audit: AuditService } {
  const audit = new AuditService();
  const approvals = new ApprovalService(audit, new InMemoryApprovalStore());
  return { approvals, audit };
}

function requestEdit(
  approvals: ApprovalService,
  caller: Caller = COORDINATOR,
) {
  return approvals.request(
    {
      type: 'order.edit.closed',
      subjectId: 'DH-1001',
      reason: 'Sửa tên khách cho đúng sổ',
    },
    caller,
  );
}

describe('ApprovalService', () => {
  it('mở yêu cầu phê duyệt ở trạng thái chờ, ghi audit', () => {
    const { approvals, audit } = buildServices();
    const approval = requestEdit(approvals);
    expect(approval.id).toBe('AP-1001');
    expect(approval.status).toBe('pending');
    expect(approval.requestedBy).toBe('son');
    expect(approval.decidedBy).toBeNull();
    expect(
      audit.getAll().filter((r) => r.action === 'approval.requested'),
    ).toHaveLength(1);
  });

  it('người xin không được tự duyệt yêu cầu của mình', () => {
    const { approvals } = buildServices();
    const approval = requestEdit(approvals);
    expect(() => approvals.approve(approval.id, COORDINATOR)).toThrow(
      'không được tự duyệt',
    );
    expect(() => approvals.approve(approval.id, DRIVER)).toThrow(
      'cần vai Quản lý hoặc Quản trị viên',
    );
    const managerRequest = requestEdit(approvals, MANAGER);
    expect(() => approvals.approve(managerRequest.id, MANAGER)).toThrow(
      'không được tự duyệt',
    );
  });

  it('chỉ Quản lý và Quản trị viên duyệt được', () => {
    const { approvals } = buildServices();
    const approval = requestEdit(approvals);
    expect(() => approvals.approve(approval.id, DRIVER)).toThrow(
      'cần vai Quản lý hoặc Quản trị viên',
    );
    const decided = approvals.approve(approval.id, MANAGER, 'Đồng ý sửa');
    expect(decided.status).toBe('approved');
    expect(decided.decidedBy).toBe('quan-ly');
    expect(decided.decisionReason).toBe('Đồng ý sửa');
  });

  it('từ chối bắt buộc có lý do, quyết rồi thì không quyết lại', () => {
    const { approvals } = buildServices();
    const approval = requestEdit(approvals);
    expect(() => approvals.reject(approval.id, MANAGER, '')).toThrow(
      'cần có lý do',
    );
    const decided = approvals.reject(
      approval.id,
      MANAGER,
      'Chưa đủ căn cứ sửa',
    );
    expect(decided.status).toBe('rejected');
    expect(() => approvals.approve(approval.id, MANAGER)).toThrow(
      'đã được quyết',
    );
  });

  it('1 phê duyệt chỉ áp dụng 1 lần', () => {
    const { approvals } = buildServices();
    const approval = requestEdit(approvals);
    expect(() => approvals.markApplied(approval.id, COORDINATOR)).toThrow(
      'không áp dụng được',
    );
    approvals.approve(approval.id, MANAGER);
    const applied = approvals.markApplied(approval.id, COORDINATOR);
    expect(applied.appliedAt).not.toBeNull();
    expect(() => approvals.markApplied(approval.id, COORDINATOR)).toThrow(
      'đã được dùng',
    );
  });

  it('lấy và lọc phê duyệt theo loại, thực thể, trạng thái', () => {
    const { approvals } = buildServices();
    requestEdit(approvals);
    const second = approvals.request(
      {
        type: 'address.low-trust',
        subjectId: 'DH-1002',
        reason: 'Địa chỉ mới chỉ đạt 62',
      },
      COORDINATOR,
    );
    approvals.approve(second.id, MANAGER);
    expect(approvals.list({})).toHaveLength(2);
    expect(
      approvals.list({ type: 'order.edit.closed' }),
    ).toHaveLength(1);
    expect(approvals.list({ status: 'approved' })).toHaveLength(1);
    expect(approvals.list({ subjectId: 'DH-1002' })).toHaveLength(1);
    expect(() => approvals.get('AP-9999')).toThrow('Không tìm thấy phê duyệt');
  });

  it('bản sao trả ra không làm đổi phê duyệt trong kho', () => {
    const { approvals } = buildServices();
    const approval = requestEdit(approvals);
    const copy = approvals.get(approval.id);
    copy.status = 'approved';
    expect(approvals.get(approval.id).status).toBe('pending');
  });
});
