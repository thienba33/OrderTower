// SPDX-License-Identifier: Apache-2.0
import type { Caller } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { createTestDbService } from '../db/test-helpers';
import { ApprovalService } from './approval.service';
import {
  InMemoryApprovalStore,
  PostgresApprovalStore,
} from './approval.store';

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
  it('mở yêu cầu phê duyệt ở trạng thái chờ, ghi audit', async () => {
    const { approvals, audit } = buildServices();
    const approval = await requestEdit(approvals);
    expect(approval.id).toBe('AP-1001');
    expect(approval.status).toBe('pending');
    expect(approval.requestedBy).toBe('son');
    expect(approval.decidedBy).toBeNull();
    expect(
      (await audit.getAll()).filter((r) => r.action === 'approval.requested'),
    ).toHaveLength(1);
  });

  it('người xin không được tự duyệt yêu cầu của mình', async () => {
    const { approvals } = buildServices();
    const approval = await requestEdit(approvals);
    await expect(approvals.approve(approval.id, COORDINATOR)).rejects.toThrow(
      'không được tự duyệt',
    );
    await expect(approvals.approve(approval.id, DRIVER)).rejects.toThrow(
      'cần vai Quản lý hoặc Quản trị viên',
    );
    const managerRequest = await requestEdit(approvals, MANAGER);
    await expect(
      approvals.approve(managerRequest.id, MANAGER),
    ).rejects.toThrow('không được tự duyệt');
  });

  it('chỉ Quản lý và Quản trị viên duyệt được', async () => {
    const { approvals } = buildServices();
    const approval = await requestEdit(approvals);
    await expect(approvals.approve(approval.id, DRIVER)).rejects.toThrow(
      'cần vai Quản lý hoặc Quản trị viên',
    );
    const decided = await approvals.approve(approval.id, MANAGER, 'Đồng ý sửa');
    expect(decided.status).toBe('approved');
    expect(decided.decidedBy).toBe('quan-ly');
    expect(decided.decisionReason).toBe('Đồng ý sửa');
  });

  it('từ chối bắt buộc có lý do, quyết rồi thì không quyết lại', async () => {
    const { approvals } = buildServices();
    const approval = await requestEdit(approvals);
    await expect(
      approvals.reject(approval.id, MANAGER, ''),
    ).rejects.toThrow('cần có lý do');
    const decided = await approvals.reject(
      approval.id,
      MANAGER,
      'Chưa đủ căn cứ sửa',
    );
    expect(decided.status).toBe('rejected');
    await expect(approvals.approve(approval.id, MANAGER)).rejects.toThrow(
      'đã được quyết',
    );
  });

  it('1 phê duyệt chỉ áp dụng 1 lần', async () => {
    const { approvals } = buildServices();
    const approval = await requestEdit(approvals);
    await expect(
      approvals.markApplied(approval.id, COORDINATOR),
    ).rejects.toThrow('không áp dụng được');
    await approvals.approve(approval.id, MANAGER);
    const applied = await approvals.markApplied(approval.id, COORDINATOR);
    expect(applied.appliedAt).not.toBeNull();
    await expect(
      approvals.markApplied(approval.id, COORDINATOR),
    ).rejects.toThrow('đã được dùng');
  });

  it('lấy và lọc phê duyệt theo loại, thực thể, trạng thái', async () => {
    const { approvals } = buildServices();
    await requestEdit(approvals);
    const second = await approvals.request(
      {
        type: 'address.low-trust',
        subjectId: 'DH-1002',
        reason: 'Địa chỉ mới chỉ đạt 62',
      },
      COORDINATOR,
    );
    await approvals.approve(second.id, MANAGER);
    expect(await approvals.list({})).toHaveLength(2);
    expect(
      await approvals.list({ type: 'order.edit.closed' }),
    ).toHaveLength(1);
    expect(await approvals.list({ status: 'approved' })).toHaveLength(1);
    expect(await approvals.list({ subjectId: 'DH-1002' })).toHaveLength(1);
    await expect(approvals.get('AP-9999')).rejects.toThrow(
      'Không tìm thấy phê duyệt',
    );
  });

  it('bản sao trả ra không làm đổi phê duyệt trong kho', async () => {
    const { approvals } = buildServices();
    const approval = await requestEdit(approvals);
    const copy = await approvals.get(approval.id);
    copy.status = 'approved';
    expect((await approvals.get(approval.id)).status).toBe('pending');
  });
});

describe('PostgresApprovalStore', () => {
  it('lưu rồi đọc lại giống hệt, kèm quyết định và lần áp dụng', async () => {
    const db = await createTestDbService();
    const audit = new AuditService();
    const store = new PostgresApprovalStore(db);
    const approvals = new ApprovalService(audit, store);
    const requested = await approvals.request(
      {
        type: 'order.edit.closed',
        subjectId: 'DH-1001',
        reason: 'Sửa tên khách cho đúng sổ',
      },
      COORDINATOR,
    );
    expect(requested.id).toBe('AP-1001');
    const decided = await approvals.approve(
      requested.id,
      MANAGER,
      'Đồng ý sửa',
    );
    const applied = await approvals.markApplied(requested.id, COORDINATOR);
    const loaded = await store.findById(requested.id);
    expect(loaded).toEqual(applied);
    expect(loaded?.decidedBy).toBe('quan-ly');
    expect(loaded?.decisionReason).toBe('Đồng ý sửa');
    expect(loaded?.appliedAt).not.toBeNull();
    expect((await store.list()).map((item) => item.id)).toEqual(['AP-1001']);
    expect(await store.findById('AP-9999')).toBeNull();
  });

  it('khởi động lại service thì số phê duyệt tiếp tục tăng', async () => {
    const db = await createTestDbService();
    const audit = new AuditService();
    const store = new PostgresApprovalStore(db);
    const first = new ApprovalService(audit, store);
    await first.onModuleInit();
    const one = await first.request(
      { type: 'order.edit.closed', subjectId: 'DH-1001', reason: 'Lý do 1' },
      COORDINATOR,
    );
    expect(one.id).toBe('AP-1001');
    // Mô phỏng khởi động lại: service mới, cùng kho Postgres.
    const second = new ApprovalService(audit, store);
    await second.onModuleInit();
    const two = await second.request(
      { type: 'order.edit.closed', subjectId: 'DH-1002', reason: 'Lý do 2' },
      COORDINATOR,
    );
    expect(two.id).toBe('AP-1002');
    expect((await second.get(one.id)).subjectId).toBe('DH-1001');
  });
});
