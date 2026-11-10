// SPDX-License-Identifier: Apache-2.0
import type { Caller } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { WorkflowInstanceService } from './instance.service';
import { InMemoryWorkflowInstanceStore } from './instance.store';
import { WorkflowService } from './workflow.service';

const COORDINATOR: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};

function buildServices(): {
  instances: WorkflowInstanceService;
  audit: AuditService;
} {
  const workflow = new WorkflowService();
  workflow.onModuleInit();
  const audit = new AuditService();
  const instances = new WorkflowInstanceService(
    workflow,
    audit,
    new InMemoryWorkflowInstanceStore(),
  );
  return { instances, audit };
}

function startOrderFlow(
  instances: WorkflowInstanceService,
  businessKey: string,
): string {
  return instances.start(
    {
      definitionId: 'order-flow',
      businessKey,
    },
    COORDINATOR,
  ).id;
}

describe('WorkflowInstanceService', () => {
  it('bắt đầu instance ở trạng thái đầu, ghi lịch sử và audit', () => {
    const { instances, audit } = buildServices();
    const instance = instances.start(
      {
        definitionId: 'order-flow',
        businessKey: 'DH-1001',
      },
      COORDINATOR,
    );
    expect(instance.id).toBe('WF-1001');
    expect(instance.definitionVersion).toBe('1');
    expect(instance.currentState).toBe('Mới tạo');
    expect(instance.status).toBe('active');
    expect(instance.history).toHaveLength(1);
    expect(instance.history[0]).toMatchObject({ from: null, to: 'Mới tạo' });
    expect(
      audit.getAll().filter((r) => r.action === 'workflow.instance.started'),
    ).toHaveLength(1);
  });

  it('không có định nghĩa thì báo 404', () => {
    const { instances } = buildServices();
    expect(() =>
      instances.start(
        {
          definitionId: 'khong-co',
          businessKey: 'DH-1001',
        },
        COORDINATOR,
      ),
    ).toThrow('Không tìm thấy định nghĩa');
  });

  it('1 businessKey chỉ có 1 instance cho mỗi luồng', () => {
    const { instances } = buildServices();
    instances.start(
      {
        definitionId: 'order-flow',
        businessKey: 'DH-1001',
      },
      COORDINATOR,
    );
    expect(() =>
      instances.start(
        {
          definitionId: 'order-flow',
          businessKey: 'DH-1001',
        },
        COORDINATOR,
      ),
    ).toThrow('Đã có instance');
  });

  it('chuyển hợp lệ đổi trạng thái, tới trạng thái cuối thì hoàn thành', () => {
    const { instances } = buildServices();
    const id = startOrderFlow(instances, 'DH-1001');
    let current = instances.transition(
      id,
      {
        to: 'Đã kiểm tra',
      },
      COORDINATOR,
    );
    expect(current.currentState).toBe('Đã kiểm tra');
    expect(current.status).toBe('active');
    expect(current.history).toHaveLength(2);
    current = instances.transition(
      id,
      {
        to: 'Hủy',
        reason: 'Khách đổi ý',
      },
      COORDINATOR,
    );
    expect(current.currentState).toBe('Hủy');
    expect(current.status).toBe('completed');
    expect(current.history.at(-1)).toMatchObject({
      to: 'Hủy',
      reason: 'Khách đổi ý',
    });
  });

  it('chuyển trái phép hoặc sai vai thì từ chối kèm audit', () => {
    const { instances, audit } = buildServices();
    const id = startOrderFlow(instances, 'DH-1001');
    expect(() =>
      instances.transition(id, { to: 'Đã giao' }, COORDINATOR),
    ).toThrow('không có trong định nghĩa');
    expect(() =>
      instances.transition(
        id,
        {
          to: 'Đã kiểm tra',
        },
        {
          userId: 'user-nam',
          username: 'nam',
          roles: ['Tài xế'],
        },
      ),
    ).toThrow('yêu cầu vai');
    expect(instances.get(id).currentState).toBe('Mới tạo');
    expect(
      audit
        .getAll()
        .filter((r) => r.action === 'workflow.instance.transition.denied'),
    ).toHaveLength(2);
  });

  it('tạm dừng rồi tiếp tục, chuyển khi đang tạm dừng thì chặn', () => {
    const { instances } = buildServices();
    const id = startOrderFlow(instances, 'DH-1001');
    const suspended = instances.suspend(id, COORDINATOR, 'Chờ xác minh');
    expect(suspended.status).toBe('suspended');
    expect(() =>
      instances.transition(id, { to: 'Đã kiểm tra' }, COORDINATOR),
    ).toThrow('đang ở trạng thái "suspended"');
    const resumed = instances.resume(id, COORDINATOR);
    expect(resumed.status).toBe('active');
    expect(
      instances.transition(id, { to: 'Đã kiểm tra' }, COORDINATOR)
        .currentState,
    ).toBe('Đã kiểm tra');
  });

  it('kết thúc cần có lý do, xong thì không chuyển được nữa', () => {
    const { instances } = buildServices();
    const id = startOrderFlow(instances, 'DH-1001');
    expect(() => instances.terminate(id, COORDINATOR, '')).toThrow(
      'cần có lý do',
    );
    const terminated = instances.terminate(
      id,
      COORDINATOR,
      'Khách hủy toàn bộ',
    );
    expect(terminated.status).toBe('terminated');
    expect(() =>
      instances.transition(id, { to: 'Đã kiểm tra' }, COORDINATOR),
    ).toThrow('đang ở trạng thái "terminated"');
    expect(() =>
      instances.terminate(id, COORDINATOR, 'Lý do khác'),
    ).toThrow('không kết thúc được');
  });

  it('lấy và lọc instance theo luồng, businessKey, trạng thái', () => {
    const { instances } = buildServices();
    const id1 = startOrderFlow(instances, 'DH-1001');
    startOrderFlow(instances, 'DH-1002');
    instances.suspend(id1, COORDINATOR);
    expect(instances.list({})).toHaveLength(2);
    expect(
      instances.list({ businessKey: 'DH-1002' }),
    ).toHaveLength(1);
    expect(instances.list({ status: 'suspended' })).toHaveLength(1);
    expect(instances.list({ status: 'completed' })).toHaveLength(0);
    expect(() => instances.get('WF-9999')).toThrow('Không tìm thấy workflow instance');
  });

  it('bản sao trả ra không làm đổi instance trong kho', () => {
    const { instances } = buildServices();
    const id = startOrderFlow(instances, 'DH-1001');
    const copy = instances.get(id);
    copy.currentState = 'Đã giao';
    expect(instances.get(id).currentState).toBe('Mới tạo');
  });
});
