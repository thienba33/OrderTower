// SPDX-License-Identifier: Apache-2.0
import type { Caller } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { createTestDbService } from '../db/test-helpers';
import { WorkflowInstanceService } from './instance.service';
import {
  InMemoryWorkflowInstanceStore,
  PostgresWorkflowInstanceStore,
} from './instance.store';
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

async function startOrderFlow(
  instances: WorkflowInstanceService,
  businessKey: string,
): Promise<string> {
  return (
    await instances.start(
      {
        definitionId: 'order-flow',
        businessKey,
      },
      COORDINATOR,
    )
  ).id;
}

describe('WorkflowInstanceService', () => {
  it('bắt đầu instance ở trạng thái đầu, ghi lịch sử và audit', async () => {
    const { instances, audit } = buildServices();
    const instance = await instances.start(
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
      (await audit.getAll()).filter(
        (r) => r.action === 'workflow.instance.started',
      ),
    ).toHaveLength(1);
  });

  it('không có định nghĩa thì báo 404', async () => {
    const { instances } = buildServices();
    await expect(
      instances.start(
        {
          definitionId: 'khong-co',
          businessKey: 'DH-1001',
        },
        COORDINATOR,
      ),
    ).rejects.toThrow('Không tìm thấy định nghĩa');
  });

  it('1 businessKey chỉ có 1 instance cho mỗi luồng', async () => {
    const { instances } = buildServices();
    await instances.start(
      {
        definitionId: 'order-flow',
        businessKey: 'DH-1001',
      },
      COORDINATOR,
    );
    await expect(
      instances.start(
        {
          definitionId: 'order-flow',
          businessKey: 'DH-1001',
        },
        COORDINATOR,
      ),
    ).rejects.toThrow('Đã có instance');
  });

  it('chuyển hợp lệ đổi trạng thái, tới trạng thái cuối thì hoàn thành', async () => {
    const { instances } = buildServices();
    const id = await startOrderFlow(instances, 'DH-1001');
    let current = await instances.transition(
      id,
      {
        to: 'Đã kiểm tra',
      },
      COORDINATOR,
    );
    expect(current.currentState).toBe('Đã kiểm tra');
    expect(current.status).toBe('active');
    expect(current.history).toHaveLength(2);
    current = await instances.transition(
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

  it('chuyển trái phép hoặc sai vai thì từ chối kèm audit', async () => {
    const { instances, audit } = buildServices();
    const id = await startOrderFlow(instances, 'DH-1001');
    await expect(
      instances.transition(id, { to: 'Đã giao' }, COORDINATOR),
    ).rejects.toThrow('không có trong định nghĩa');
    await expect(
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
    ).rejects.toThrow('yêu cầu vai');
    expect((await instances.get(id)).currentState).toBe('Mới tạo');
    expect(
      (await audit.getAll()).filter(
        (r) => r.action === 'workflow.instance.transition.denied',
      ),
    ).toHaveLength(2);
  });

  it('tạm dừng rồi tiếp tục, chuyển khi đang tạm dừng thì chặn', async () => {
    const { instances } = buildServices();
    const id = await startOrderFlow(instances, 'DH-1001');
    const suspended = await instances.suspend(id, COORDINATOR, 'Chờ xác minh');
    expect(suspended.status).toBe('suspended');
    await expect(
      instances.transition(id, { to: 'Đã kiểm tra' }, COORDINATOR),
    ).rejects.toThrow('đang ở trạng thái "suspended"');
    const resumed = await instances.resume(id, COORDINATOR);
    expect(resumed.status).toBe('active');
    expect(
      (await instances.transition(id, { to: 'Đã kiểm tra' }, COORDINATOR))
        .currentState,
    ).toBe('Đã kiểm tra');
  });

  it('kết thúc cần có lý do, xong thì không chuyển được nữa', async () => {
    const { instances } = buildServices();
    const id = await startOrderFlow(instances, 'DH-1001');
    await expect(instances.terminate(id, COORDINATOR, '')).rejects.toThrow(
      'cần có lý do',
    );
    const terminated = await instances.terminate(
      id,
      COORDINATOR,
      'Khách hủy toàn bộ',
    );
    expect(terminated.status).toBe('terminated');
    await expect(
      instances.transition(id, { to: 'Đã kiểm tra' }, COORDINATOR),
    ).rejects.toThrow('đang ở trạng thái "terminated"');
    await expect(
      instances.terminate(id, COORDINATOR, 'Lý do khác'),
    ).rejects.toThrow('không kết thúc được');
  });

  it('lấy và lọc instance theo luồng, businessKey, trạng thái', async () => {
    const { instances } = buildServices();
    const id1 = await startOrderFlow(instances, 'DH-1001');
    await startOrderFlow(instances, 'DH-1002');
    await instances.suspend(id1, COORDINATOR);
    expect(await instances.list({})).toHaveLength(2);
    expect(
      await instances.list({ businessKey: 'DH-1002' }),
    ).toHaveLength(1);
    expect(await instances.list({ status: 'suspended' })).toHaveLength(1);
    expect(await instances.list({ status: 'completed' })).toHaveLength(0);
    await expect(instances.get('WF-9999')).rejects.toThrow(
      'Không tìm thấy workflow instance',
    );
  });

  it('bản sao trả ra không làm đổi instance trong kho', async () => {
    const { instances } = buildServices();
    const id = await startOrderFlow(instances, 'DH-1001');
    const copy = await instances.get(id);
    copy.currentState = 'Đã giao';
    expect((await instances.get(id)).currentState).toBe('Mới tạo');
  });
});

describe('PostgresWorkflowInstanceStore', () => {
  it('lưu rồi đọc lại giống hệt, kèm lịch sử và context', async () => {
    const db = await createTestDbService();
    const workflow = new WorkflowService();
    workflow.onModuleInit();
    const audit = new AuditService();
    const store = new PostgresWorkflowInstanceStore(db);
    const instances = new WorkflowInstanceService(workflow, audit, store);
    const started = await instances.start(
      { definitionId: 'order-flow', businessKey: 'DH-1001', context: { kenh: 'Web' } },
      COORDINATOR,
    );
    expect(started.id).toBe('WF-1001');
    const moved = await instances.transition(
      started.id,
      { to: 'Đã kiểm tra' },
      COORDINATOR,
    );
    expect(moved.history).toHaveLength(2);
    const loaded = await store.findById(started.id);
    expect(loaded).toEqual(moved);
    expect(loaded?.context).toEqual({ kenh: 'Web' });
    expect(await store.findByBusinessKey('order-flow', 'DH-1001')).toEqual(
      moved,
    );
    expect(await store.findByBusinessKey('order-flow', 'DH-9999')).toBeNull();
    expect((await store.list()).map((item) => item.id)).toEqual(['WF-1001']);
  });

  it('khởi động lại service thì số instance tiếp tục tăng', async () => {
    const db = await createTestDbService();
    const workflow = new WorkflowService();
    workflow.onModuleInit();
    const audit = new AuditService();
    const store = new PostgresWorkflowInstanceStore(db);
    const first = new WorkflowInstanceService(workflow, audit, store);
    await first.onModuleInit();
    const one = await first.start(
      { definitionId: 'order-flow', businessKey: 'DH-1001' },
      COORDINATOR,
    );
    expect(one.id).toBe('WF-1001');
    // Mô phỏng khởi động lại: service mới, cùng kho Postgres.
    const second = new WorkflowInstanceService(workflow, audit, store);
    await second.onModuleInit();
    const two = await second.start(
      { definitionId: 'order-flow', businessKey: 'DH-1002' },
      COORDINATOR,
    );
    expect(two.id).toBe('WF-1002');
    expect((await second.get(one.id)).businessKey).toBe('DH-1001');
  });
});
