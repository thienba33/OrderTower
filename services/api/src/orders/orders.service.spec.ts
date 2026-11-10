// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import {
  InMemoryApprovalStore,
  PostgresApprovalStore,
} from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import { PostgresAuditStore } from '../audit/audit.store';
import type { Caller } from '../auth/auth.types';
import { DbService } from '../db/db.service';
import { createTestDbService } from '../db/test-helpers';
import { InventoryService } from '../inventory/inventory.service';
import { PostgresInventoryStore } from '../inventory/inventory.store';
import { WorkflowInstanceService } from '../workflow/instance.service';
import {
  InMemoryWorkflowInstanceStore,
  PostgresWorkflowInstanceStore,
} from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { OrdersService } from './orders.service';
import { PostgresOrderStore } from './orders.store';

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  inventory: InventoryService;
  instances: WorkflowInstanceService;
  approvals: ApprovalService;
}> {
  const workflow = new WorkflowService();
  workflow.onModuleInit();
  const audit = new AuditService();
  const inventory = new InventoryService();
  await inventory.onModuleInit();
  const address = new AddressService();
  address.onModuleInit();
  const instances = new WorkflowInstanceService(
    workflow,
    audit,
    new InMemoryWorkflowInstanceStore(),
  );
  const approvals = new ApprovalService(audit, new InMemoryApprovalStore());
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
    approvals,
  );
  return { orders, audit, inventory, instances, approvals };
}

function createInput(key: string) {
  return {
    idempotencyKey: key,
    customer: 'Hộ nước mắm A',
    items: [{ sku: 'NM-40', quantity: 2 }],
    address: {
      province: 'Hà Nội',
      district: 'Hai Bà Trưng',
      ward: 'Phường Phạm Đình Hổ',
      street: 'Số 8 phố Hàng Bè',
    },
    actor: 'son',
    role: 'Điều phối viên',
  };
}

const COORDINATOR: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};
const WAREHOUSE: Caller = {
  userId: 'user-minh',
  username: 'minh',
  roles: ['Nhân viên kho'],
};
const DRIVER: Caller = {
  userId: 'user-nam',
  username: 'nam',
  roles: ['Tài xế'],
};
const MANAGER: Caller = {
  userId: 'user-quanly',
  username: 'quan-ly',
  roles: ['Quản lý'],
};

describe('OrdersService', () => {
  it('tạo đơn ở trạng thái Mới tạo, ghi lịch sử và audit', async () => {
    const { orders, audit, instances } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.id).toBe('DH-1001');
    expect(order.state).toBe('Mới tạo');
    expect(order.workflowInstanceId).toBe('WF-1001');
    const instance = await instances.findByBusinessKey('order-flow', 'DH-1001');
    expect(instance?.currentState).toBe('Mới tạo');
    expect(instance?.status).toBe('active');
    expect(order.history).toHaveLength(1);
    expect(order.history[0]).toMatchObject({ from: null, to: 'Mới tạo' });
    expect(await audit.getAll()).toHaveLength(2);
    expect((await audit.getAll()).map((record) => record.action)).toEqual([
      'workflow.instance.started',
      'order.created',
    ]);
  });

  it('từ chối đơn trùng idempotencyKey', async () => {
    const { orders, audit } = await buildServices();
    await orders.create(createInput('key-1'), COORDINATOR);
    await expect(
      orders.create(createInput('key-1'), COORDINATOR),
    ).rejects.toThrow('đã tồn tại');
    expect(await orders.list()).toHaveLength(1);
    expect(await audit.getAll()).toHaveLength(2);
  });

  it('đơn đi tròn 9 trạng thái tới Hoàn', async () => {
    const { orders, audit, instances } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    const steps: Array<{
      to: string;
      caller: Caller;
      handling?: string;
    }> = [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
      { to: 'Đang giao', caller: COORDINATOR },
      { to: 'Đã giao', caller: DRIVER },
      {
        to: 'Hoàn',
        caller: COORDINATOR,
        handling: 'Đối soát xong, khách giữ hàng',
      },
    ];
    let current = order;
    for (const step of steps) {
      current = await orders.transition(
        current.id,
        {
          to: step.to,
          ...(step.handling ? { handling: step.handling } : {}),
        },
        step.caller,
      );
    }
    expect(current.state).toBe('Hoàn');
    expect(current.history).toHaveLength(8);
    expect(await audit.getAll()).toHaveLength(9);
    expect((await audit.verify()).valid).toBe(true);
    const instance = await instances.findByBusinessKey('order-flow', order.id);
    expect(instance?.status).toBe('completed');
    expect(instance?.history).toHaveLength(8);
    expect(instance?.currentState).toBe('Hoàn');
  });

  it('hủy đơn từ Mới tạo cần có lý do', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Hủy' }, COORDINATOR),
    ).rejects.toThrow('cần có lý do');
    const cancelled = await orders.transition(order.id, {
      to: 'Hủy',
      reason: 'Khách đổi ý',
    }, COORDINATOR);
    expect(cancelled.state).toBe('Hủy');
  });

  it('từ chối chuyển trái phép, đơn giữ nguyên trạng thái, có ghi audit', async () => {
    const { orders, audit } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Đã giao' }, COORDINATOR),
    ).rejects.toThrow('không có trong định nghĩa');
    expect((await orders.findOne(order.id)).state).toBe('Mới tạo');
    const denied = (await audit.getAll()).filter(
      (record) => record.action === 'order.transition.denied',
    );
    expect(denied).toHaveLength(1);
    expect((await audit.verify()).valid).toBe(true);
  });

  it('từ chối khi sai vai', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Đã kiểm tra' }, DRIVER),
    ).rejects.toThrow('yêu cầu vai');
  });

  it('đơn đã đóng thì mọi chuyển đều bị chặn', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await orders.transition(order.id, {
      to: 'Hủy',
      reason: 'Khách đổi ý',
    }, COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Mới tạo' }, COORDINATOR),
    ).rejects.toThrow('đã ở trạng thái đóng');
  });

  it('đóng gói thành công thì giữ hàng trong kho', async () => {
    const { orders, inventory } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await orders.transition(order.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    await orders.transition(order.id, { to: 'Chờ kho' }, COORDINATOR);
    const packed = await orders.transition(order.id, {
      to: 'Đang đóng gói',
    }, WAREHOUSE);
    expect(packed.state).toBe('Đang đóng gói');
    expect(await inventory.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
  });

  it('tồn kho không đủ thì chặn đóng gói, đơn giữ nguyên trạng thái', async () => {
    const { orders, audit, inventory } = await buildServices();
    const order = await orders.create({
      ...createInput('key-1'),
      items: [{ sku: 'NM-40', quantity: 9999 }],
    }, COORDINATOR);
    await orders.transition(order.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    await orders.transition(order.id, { to: 'Chờ kho' }, COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Đang đóng gói' }, WAREHOUSE),
    ).rejects.toThrow('Tồn kho không đủ');
    expect((await orders.findOne(order.id)).state).toBe('Chờ kho');
    expect(await inventory.get('NM-40')).toMatchObject({
      stock: 452,
      reserved: 0,
    });
    const denied = (await audit.getAll()).filter(
      (record) => record.action === 'order.transition.denied',
    );
    expect(denied).toHaveLength(1);
  });

  it('SKU không có trong kho thì chặn đóng gói', async () => {
    const { orders } = await buildServices();
    const order = await orders.create({
      ...createInput('key-1'),
      items: [{ sku: 'XX-00', quantity: 1 }],
    }, COORDINATOR);
    await orders.transition(order.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    await orders.transition(order.id, { to: 'Chờ kho' }, COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Đang đóng gói' }, WAREHOUSE),
    ).rejects.toThrow('không có trong kho');
  });

  it('tạo đơn lưu mức tin cậy địa chỉ tính từ địa chỉ', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.addressTrust).toBe(100);
    expect(order.addressLevel).toBe('Tin cậy cao');
  });

  it('địa chỉ yếu thì chặn ở chuyển sang Chờ kho', async () => {
    const { orders, audit } = await buildServices();
    const order = await orders.create({
      ...createInput('key-1'),
      address: { province: 'Hà Nội' },
    }, COORDINATOR);
    expect(order.addressTrust).toBe(40);
    await orders.transition(order.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Chờ kho' }, COORDINATOR),
    ).rejects.toThrow('chưa đạt tối thiểu');
    expect((await orders.findOne(order.id)).state).toBe('Đã kiểm tra');
    const denied = (await audit.getAll()).filter(
      (record) => record.action === 'order.transition.denied',
    );
    expect(denied).toHaveLength(1);
  });

  it('đơn không có địa chỉ thì chặn ở chuyển sang Chờ kho', async () => {
    const { orders } = await buildServices();
    const order = await orders.create({
      ...createInput('key-1'),
      address: undefined,
    }, COORDINATOR);
    expect(order.addressTrust).toBeNull();
    await orders.transition(order.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    await expect(
      orders.transition(order.id, { to: 'Chờ kho' }, COORDINATOR),
    ).rejects.toThrow('chưa có địa chỉ');
  });

  it('đóng đơn thiếu hướng xử lý thì báo 400, có thì ghi vào lịch sử', async () => {
    const { orders, audit } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    const steps: Array<{ to: string; caller: Caller }> = [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
      { to: 'Đang giao', caller: COORDINATOR },
      { to: 'Đã giao', caller: DRIVER },
    ];
    let current = order;
    for (const step of steps) {
      current = await orders.transition(
        current.id,
        { to: step.to },
        step.caller,
      );
    }
    await expect(
      orders.transition(current.id, { to: 'Hoàn' }, COORDINATOR),
    ).rejects.toThrow('hướng xử lý');
    const done = await orders.transition(current.id, {
      to: 'Hoàn',
      handling: 'Đối soát xong, khách giữ hàng',
    }, COORDINATOR);
    expect(done.state).toBe('Hoàn');
    expect(done.history.at(-1)).toMatchObject({
      to: 'Hoàn',
      handling: 'Đối soát xong, khách giữ hàng',
    });
    const lastAudit = (await audit.getAll()).at(-1);
    expect(lastAudit?.detail).toContain('Hướng xử lý: Đối soát xong');
  });

  it('sửa khách của đơn mở thì được, ghi audit order.edit', async () => {
    const { orders, audit } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    const updated = await orders.update(order.id, {
      customer: 'Hộ nước mắm B',
    }, COORDINATOR);
    expect(updated.customer).toBe('Hộ nước mắm B');
    expect(updated.state).toBe('Mới tạo');
    expect(updated.history).toHaveLength(2);
    expect(
      (await audit.getAll()).filter((record) => record.action === 'order.edit'),
    ).toHaveLength(1);
  });

  it('sửa mặt hàng trước khi đóng gói được, sau khi giữ hàng thì chặn', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    const renamed = await orders.update(order.id, {
      items: [{ sku: 'NM-25', quantity: 1 }],
    }, COORDINATOR);
    expect(renamed.items).toEqual([{ sku: 'NM-25', quantity: 1 }]);
    await orders.transition(order.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    await orders.transition(order.id, { to: 'Chờ kho' }, COORDINATOR);
    await orders.transition(order.id, { to: 'Đang đóng gói' }, WAREHOUSE);
    await expect(
      orders.update(order.id, {
        items: [{ sku: 'NM-40', quantity: 1 }],
      }, COORDINATOR),
    ).rejects.toThrow('đã giữ hàng');
    expect((await orders.findOne(order.id)).items).toEqual([
      { sku: 'NM-25', quantity: 1 },
    ]);
    const addressChanged = await orders.update(order.id, {
      address: {
        province: 'Hải Phòng',
        district: 'Hồng Bàng',
        ward: 'Phường Hoàng Văn Thụ',
        street: 'Số 12 Lê Lợi',
      },
    }, COORDINATOR);
    expect(addressChanged.addressTrust).toBe(100);
  });

  it('sửa địa chỉ tính lại mức tin cậy', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    const updated = await orders.update(order.id, {
      address: { province: 'Hà Nội' },
    }, COORDINATOR);
    expect(updated.addressTrust).toBe(40);
    expect(updated.addressLevel).toBe('Rủi ro cao');
  });

  it('sửa đơn đã đóng thiếu lý do hoặc phê duyệt thì báo 400', async () => {
    const { orders, approvals } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await orders.transition(order.id, { to: 'Hủy', reason: 'Khách đổi ý' }, COORDINATOR);
    await expect(
      orders.update(order.id, { customer: 'Hộ khác' }, COORDINATOR),
    ).rejects.toThrow('cần có lý do');
    await expect(
      orders.update(order.id, {
        customer: 'Hộ khác',
        reason: 'Sửa tên khách cho đúng sổ',
      }, COORDINATOR),
    ).rejects.toThrow('cần có phê duyệt');
    const approval = await approvals.request(
      {
        type: 'order.edit.closed',
        subjectId: order.id,
        reason: 'Sửa tên khách cho đúng sổ',
      },
      COORDINATOR,
    );
    await expect(
      orders.update(order.id, {
        customer: 'Hộ khác',
        reason: 'Sửa tên khách cho đúng sổ',
        approvalId: approval.id,
      }, COORDINATOR),
    ).rejects.toThrow('chưa được duyệt');
  });

  it('sửa đơn đã đóng có lý do và phê duyệt đã duyệt thì được, ghi audit riêng', async () => {
    const { orders, audit, approvals } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await orders.transition(order.id, { to: 'Hủy', reason: 'Khách đổi ý' }, COORDINATOR);
    const approval = await approvals.request(
      {
        type: 'order.edit.closed',
        subjectId: order.id,
        reason: 'Sửa tên khách cho đúng sổ',
      },
      COORDINATOR,
    );
    await approvals.approve(approval.id, MANAGER, 'Đồng ý sửa');
    const updated = await orders.update(order.id, {
      customer: 'Hộ nước mắm B',
      reason: 'Sửa tên khách cho đúng sổ',
      approvalId: approval.id,
    }, COORDINATOR);
    expect(updated.customer).toBe('Hộ nước mắm B');
    expect(updated.history.at(-1)).toMatchObject({
      from: 'Hủy',
      to: 'Hủy',
      reason: 'Sửa tên khách cho đúng sổ',
    });
    const approved = (await audit.getAll()).filter(
      (record) => record.action === 'order.edit.approved',
    );
    expect(approved).toHaveLength(1);
    expect(approved[0].detail).toContain('Phê duyệt: AP-1001 bởi quan-ly');
    expect((await approvals.get(approval.id)).appliedAt).not.toBeNull();
    await expect(
      orders.update(order.id, {
        customer: 'Hộ nước mắm C',
        reason: 'Sửa tiếp',
        approvalId: approval.id,
      }, COORDINATOR),
    ).rejects.toThrow('đã được dùng');
  });

  it('sửa đơn không có trường nào hoặc không tồn tại thì báo lỗi', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await expect(
      orders.update(order.id, {}, COORDINATOR),
    ).rejects.toThrow('ít nhất 1 trường');
    await expect(
      orders.update('DH-9999', { customer: 'X' }, COORDINATOR),
    ).rejects.toThrow('Không tìm thấy đơn');
  });

  it('không tìm thấy đơn thì báo 404', async () => {
    const { orders } = await buildServices();
    await expect(
      orders.transition('DH-9999', { to: 'Đã kiểm tra' }, COORDINATOR),
    ).rejects.toThrow('Không tìm thấy đơn');
    await expect(orders.findOne('DH-9999')).rejects.toThrow(
      'Không tìm thấy đơn',
    );
  });

  it('từ chối dữ liệu tạo đơn không hợp lệ', async () => {
    const { orders } = await buildServices();
    await expect(
      orders.create({ ...createInput('key-1'), customer: '' }, COORDINATOR),
    ).rejects.toThrow('customer là bắt buộc');
    await expect(
      orders.create({ ...createInput('key-1'), items: [] }, COORDINATOR),
    ).rejects.toThrow('items phải là mảng không rỗng');
    await expect(
      orders.create({
        ...createInput('key-1'),
        items: [{ sku: 'NM-40', quantity: 0 }],
      }, COORDINATOR),
    ).rejects.toThrow('số nguyên dương');
  });
});

describe('PostgresOrderStore', () => {
  // Dựng toàn bộ service trên 1 DB ảo. Truyền db đã có để mô phỏng khởi
  // động lại API: service mới, cùng dữ liệu Postgres.
  async function buildPostgresStack(sharedDb?: DbService) {
    const db = sharedDb ?? (await createTestDbService());
    const workflow = new WorkflowService();
    workflow.onModuleInit();
    const audit = new AuditService(new PostgresAuditStore(db));
    const inventory = new InventoryService(new PostgresInventoryStore(db));
    await inventory.onModuleInit();
    const address = new AddressService();
    address.onModuleInit();
    const instances = new WorkflowInstanceService(
      workflow,
      audit,
      new PostgresWorkflowInstanceStore(db),
    );
    await instances.onModuleInit();
    const approvals = new ApprovalService(
      audit,
      new PostgresApprovalStore(db),
    );
    await approvals.onModuleInit();
    const store = new PostgresOrderStore(db);
    const orders = new OrdersService(
      workflow,
      audit,
      inventory,
      address,
      instances,
      approvals,
      store,
    );
    await orders.onModuleInit();
    return { db, orders, audit, inventory, instances, approvals, store };
  }

  it('tạo đơn rồi đọc lại giống hệt, kèm lịch sử và instance', async () => {
    const { orders, audit, instances, store } = await buildPostgresStack();
    const created = await orders.create(createInput('key-1'), COORDINATOR);
    expect(created.id).toBe('DH-1001');
    expect(created.workflowInstanceId).toBe('WF-1001');
    const loaded = await store.findById('DH-1001');
    expect(loaded).toEqual(created);
    expect(loaded?.address).toEqual({
      province: 'Hà Nội',
      district: 'Hai Bà Trưng',
      ward: 'Phường Phạm Đình Hổ',
      street: 'Số 8 phố Hàng Bè',
    });
    expect(loaded?.addressTrust).toBe(100);
    const instance = await instances.findByBusinessKey('order-flow', 'DH-1001');
    expect(instance?.id).toBe('WF-1001');
    expect(await store.findByIdempotencyKey('key-1')).toEqual(created);
    expect(await store.findByIdempotencyKey('khong-co')).toBeNull();
    expect((await store.list()).map((order) => order.id)).toEqual(['DH-1001']);
    expect((await audit.verify()).valid).toBe(true);
  });

  it('khởi động lại service thì số đơn tiếp tục tăng, đơn cũ còn nguyên', async () => {
    const first = await buildPostgresStack();
    const one = await first.orders.create(createInput('key-1'), COORDINATOR);
    expect(one.id).toBe('DH-1001');
    await first.orders.transition(one.id, { to: 'Đã kiểm tra' }, COORDINATOR);
    // Mô phỏng khởi động lại: service mới, cùng kho Postgres.
    const second = await buildPostgresStack(first.db);
    const two = await second.orders.create(createInput('key-2'), COORDINATOR);
    expect(two.id).toBe('DH-1002');
    const old = await second.orders.findOne('DH-1001');
    expect(old.state).toBe('Đã kiểm tra');
    expect(old.history).toHaveLength(2);
    expect((await second.audit.verify()).valid).toBe(true);
  });
});
