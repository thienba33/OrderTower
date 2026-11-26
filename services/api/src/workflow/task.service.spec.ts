// SPDX-License-Identifier: Apache-2.0
import type { Caller } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { InMemoryWorkflowInstanceStore } from './instance.store';
import { WorkflowInstanceService } from './instance.service';
import { WorkflowTaskService } from './task.service';
import { WorkflowService } from './workflow.service';

const COORDINATOR: Caller = {
  userId: 'user-diep',
  username: 'diep',
  roles: ['Điều phối viên'],
};

const WAREHOUSE: Caller = {
  userId: 'user-kho',
  username: 'kho',
  roles: ['Nhân viên kho'],
};

const DRIVER: Caller = {
  userId: 'user-tx',
  username: 'tx',
  roles: ['Tài xế'],
};

describe('WorkflowTaskService', () => {
  function build() {
    const workflow = new WorkflowService();
    workflow.onModuleInit();
    const audit = new AuditService();
    const instances = new WorkflowInstanceService(
      workflow,
      audit,
      new InMemoryWorkflowInstanceStore(),
    );
    const tasks = new WorkflowTaskService(workflow, instances);
    return { workflow, instances, tasks };
  }

  it('trả task theo vai, có transition, hạn và SLA', async () => {
    const { instances, tasks } = build();
    await instances.start(
      {
        definitionId: 'order-flow',
        businessKey: 'DH-1001',
        context: { deadline: '2000-01-01T00:00:00.000Z' },
      },
      COORDINATOR,
    );
    await instances.start(
      {
        definitionId: 'order-flow',
        businessKey: 'DH-1002',
        context: { deadline: '2999-01-01T00:00:00.000Z' },
      },
      COORDINATOR,
    );
    const second = await instances.findByBusinessKey('order-flow', 'DH-1002');
    if (!second) {
      throw new Error('missing second instance');
    }
    await instances.transition(second.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    await instances.transition(second.id, { to: 'Chờ kho' }, COORDINATOR);

    const dispatcherTasks = await tasks.list(
      COORDINATOR,
      {},
      new Date('2026-11-26T00:00:00.000Z'),
    );
    expect(dispatcherTasks).toHaveLength(1);
    expect(dispatcherTasks[0]).toMatchObject({
      businessKey: 'DH-1001',
      currentState: 'Mới tạo',
      slaState: 'overdue',
    });
    expect(dispatcherTasks[0].availableTransitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: 'Đã kiểm tra', role: 'Điều phối viên' }),
      ]),
    );
    expect(dispatcherTasks[0].dueAt).toBe('2000-01-01T00:00:00.000Z');

    const warehouseTasks = await tasks.list(
      WAREHOUSE,
      {},
      new Date('2026-11-26T00:00:00.000Z'),
    );
    expect(warehouseTasks).toHaveLength(1);
    expect(warehouseTasks[0]).toMatchObject({
      businessKey: 'DH-1002',
      currentState: 'Chờ kho',
      slaState: 'normal',
    });
    expect(
      warehouseTasks[0].availableTransitions[0]?.to,
    ).toBe('Đang đóng gói');
  });

  it('lọc overdue và giới hạn số task', async () => {
    const { instances, tasks } = build();
    await instances.start(
      {
        definitionId: 'order-flow',
        businessKey: 'DH-1001',
        context: { deadline: '2000-01-01T00:00:00.000Z' },
      },
      COORDINATOR,
    );
    const all = await tasks.list(COORDINATOR, {});
    expect(all).toHaveLength(1);
    expect(await tasks.list(COORDINATOR, { overdue: true })).toHaveLength(1);
    await expect(
      tasks.list(COORDINATOR, { overdue: true, limit: 0 }),
    ).rejects.toThrow('limit');
  });

  it('tài xế không có DB scope thì không thấy task của người khác', async () => {
    const { instances, tasks } = build();
    await instances.start(
      { definitionId: 'order-flow', businessKey: 'DH-1001' },
      COORDINATOR,
    );
    await expect(tasks.list(DRIVER, {})).resolves.toEqual([]);
  });
});
