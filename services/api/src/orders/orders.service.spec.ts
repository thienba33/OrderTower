// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { OrdersService } from './orders.service';

function buildServices(): {
  orders: OrdersService;
  audit: AuditService;
  inventory: InventoryService;
  instances: WorkflowInstanceService;
} {
  const workflow = new WorkflowService();
  workflow.onModuleInit();
  const audit = new AuditService();
  const inventory = new InventoryService();
  inventory.onModuleInit();
  const address = new AddressService();
  address.onModuleInit();
  const instances = new WorkflowInstanceService(
    workflow,
    audit,
    new InMemoryWorkflowInstanceStore(),
  );
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
  );
  return { orders, audit, inventory, instances };
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

const COORDINATOR = { actor: 'son', role: 'Điều phối viên' };
const WAREHOUSE = { actor: 'minh', role: 'Nhân viên kho' };
const DRIVER = { actor: 'nam', role: 'Tài xế' };

describe('OrdersService', () => {
  it('tạo đơn ở trạng thái Mới tạo, ghi lịch sử và audit', () => {
    const { orders, audit, instances } = buildServices();
    const order = orders.create(createInput('key-1'));
    expect(order.id).toBe('DH-1001');
    expect(order.state).toBe('Mới tạo');
    expect(order.workflowInstanceId).toBe('WF-1001');
    const instance = instances.findByBusinessKey('order-flow', 'DH-1001');
    expect(instance?.currentState).toBe('Mới tạo');
    expect(instance?.status).toBe('active');
    expect(order.history).toHaveLength(1);
    expect(order.history[0]).toMatchObject({ from: null, to: 'Mới tạo' });
    expect(audit.getAll()).toHaveLength(2);
    expect(audit.getAll().map((record) => record.action)).toEqual([
      'workflow.instance.started',
      'order.created',
    ]);
  });

  it('từ chối đơn trùng idempotencyKey', () => {
    const { orders, audit } = buildServices();
    orders.create(createInput('key-1'));
    expect(() => orders.create(createInput('key-1'))).toThrow('đã tồn tại');
    expect(orders.list()).toHaveLength(1);
    expect(audit.getAll()).toHaveLength(2);
  });

  it('đơn đi tròn 9 trạng thái tới Hoàn', () => {
    const { orders, audit, instances } = buildServices();
    const order = orders.create(createInput('key-1'));
    const steps: Array<{
      to: string;
      actor: string;
      role: string;
      handling?: string;
    }> = [
      { to: 'Đã kiểm tra', ...COORDINATOR },
      { to: 'Chờ kho', ...COORDINATOR },
      { to: 'Đang đóng gói', ...WAREHOUSE },
      { to: 'Chờ điều xe', ...WAREHOUSE },
      { to: 'Đang giao', ...COORDINATOR },
      { to: 'Đã giao', ...DRIVER },
      { to: 'Hoàn', ...COORDINATOR, handling: 'Đối soát xong, khách giữ hàng' },
    ];
    let current = order;
    for (const step of steps) {
      current = orders.transition(current.id, step);
    }
    expect(current.state).toBe('Hoàn');
    expect(current.history).toHaveLength(8);
    expect(audit.getAll()).toHaveLength(9);
    expect(audit.verify().valid).toBe(true);
    const instance = instances.findByBusinessKey('order-flow', order.id);
    expect(instance?.status).toBe('completed');
    expect(instance?.history).toHaveLength(8);
    expect(instance?.currentState).toBe('Hoàn');
  });

  it('hủy đơn từ Mới tạo cần có lý do', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    expect(() =>
      orders.transition(order.id, { to: 'Hủy', ...COORDINATOR }),
    ).toThrow('cần có lý do');
    const cancelled = orders.transition(order.id, {
      to: 'Hủy',
      ...COORDINATOR,
      reason: 'Khách đổi ý',
    });
    expect(cancelled.state).toBe('Hủy');
  });

  it('từ chối chuyển trái phép, đơn giữ nguyên trạng thái, có ghi audit', () => {
    const { orders, audit } = buildServices();
    const order = orders.create(createInput('key-1'));
    expect(() =>
      orders.transition(order.id, { to: 'Đã giao', ...COORDINATOR }),
    ).toThrow('không có trong định nghĩa');
    expect(orders.findOne(order.id).state).toBe('Mới tạo');
    const denied = audit
      .getAll()
      .filter((record) => record.action === 'order.transition.denied');
    expect(denied).toHaveLength(1);
    expect(audit.verify().valid).toBe(true);
  });

  it('từ chối khi sai vai', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    expect(() =>
      orders.transition(order.id, { to: 'Đã kiểm tra', ...DRIVER }),
    ).toThrow('không được phép');
  });

  it('đơn đã đóng thì mọi chuyển đều bị chặn', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    orders.transition(order.id, {
      to: 'Hủy',
      ...COORDINATOR,
      reason: 'Khách đổi ý',
    });
    expect(() =>
      orders.transition(order.id, { to: 'Mới tạo', ...COORDINATOR }),
    ).toThrow('đã ở trạng thái đóng');
  });

  it('đóng gói thành công thì giữ hàng trong kho', () => {
    const { orders, inventory } = buildServices();
    const order = orders.create(createInput('key-1'));
    orders.transition(order.id, { to: 'Đã kiểm tra', ...COORDINATOR });
    orders.transition(order.id, { to: 'Chờ kho', ...COORDINATOR });
    const packed = orders.transition(order.id, {
      to: 'Đang đóng gói',
      ...WAREHOUSE,
    });
    expect(packed.state).toBe('Đang đóng gói');
    expect(inventory.get('NM-40')).toMatchObject({ stock: 450, reserved: 2 });
  });

  it('tồn kho không đủ thì chặn đóng gói, đơn giữ nguyên trạng thái', () => {
    const { orders, audit, inventory } = buildServices();
    const order = orders.create({
      ...createInput('key-1'),
      items: [{ sku: 'NM-40', quantity: 9999 }],
    });
    orders.transition(order.id, { to: 'Đã kiểm tra', ...COORDINATOR });
    orders.transition(order.id, { to: 'Chờ kho', ...COORDINATOR });
    expect(() =>
      orders.transition(order.id, { to: 'Đang đóng gói', ...WAREHOUSE }),
    ).toThrow('Tồn kho không đủ');
    expect(orders.findOne(order.id).state).toBe('Chờ kho');
    expect(inventory.get('NM-40')).toMatchObject({ stock: 452, reserved: 0 });
    const denied = audit
      .getAll()
      .filter((record) => record.action === 'order.transition.denied');
    expect(denied).toHaveLength(1);
  });

  it('SKU không có trong kho thì chặn đóng gói', () => {
    const { orders } = buildServices();
    const order = orders.create({
      ...createInput('key-1'),
      items: [{ sku: 'XX-00', quantity: 1 }],
    });
    orders.transition(order.id, { to: 'Đã kiểm tra', ...COORDINATOR });
    orders.transition(order.id, { to: 'Chờ kho', ...COORDINATOR });
    expect(() =>
      orders.transition(order.id, { to: 'Đang đóng gói', ...WAREHOUSE }),
    ).toThrow('không có trong kho');
  });

  it('tạo đơn lưu mức tin cậy địa chỉ tính từ địa chỉ', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    expect(order.addressTrust).toBe(100);
    expect(order.addressLevel).toBe('Tin cậy cao');
  });

  it('địa chỉ yếu thì chặn ở chuyển sang Chờ kho', () => {
    const { orders, audit } = buildServices();
    const order = orders.create({
      ...createInput('key-1'),
      address: { province: 'Hà Nội' },
    });
    expect(order.addressTrust).toBe(40);
    orders.transition(order.id, { to: 'Đã kiểm tra', ...COORDINATOR });
    expect(() =>
      orders.transition(order.id, { to: 'Chờ kho', ...COORDINATOR }),
    ).toThrow('chưa đạt tối thiểu');
    expect(orders.findOne(order.id).state).toBe('Đã kiểm tra');
    const denied = audit
      .getAll()
      .filter((record) => record.action === 'order.transition.denied');
    expect(denied).toHaveLength(1);
  });

  it('đơn không có địa chỉ thì chặn ở chuyển sang Chờ kho', () => {
    const { orders } = buildServices();
    const order = orders.create({
      ...createInput('key-1'),
      address: undefined,
    });
    expect(order.addressTrust).toBeNull();
    orders.transition(order.id, { to: 'Đã kiểm tra', ...COORDINATOR });
    expect(() =>
      orders.transition(order.id, { to: 'Chờ kho', ...COORDINATOR }),
    ).toThrow('chưa có địa chỉ');
  });

  it('đóng đơn thiếu hướng xử lý thì báo 400, có thì ghi vào lịch sử', () => {
    const { orders, audit } = buildServices();
    const order = orders.create(createInput('key-1'));
    const steps: Array<{ to: string; actor: string; role: string }> = [
      { to: 'Đã kiểm tra', ...COORDINATOR },
      { to: 'Chờ kho', ...COORDINATOR },
      { to: 'Đang đóng gói', ...WAREHOUSE },
      { to: 'Chờ điều xe', ...WAREHOUSE },
      { to: 'Đang giao', ...COORDINATOR },
      { to: 'Đã giao', ...DRIVER },
    ];
    let current = order;
    for (const step of steps) {
      current = orders.transition(current.id, step);
    }
    expect(() =>
      orders.transition(current.id, { to: 'Hoàn', ...COORDINATOR }),
    ).toThrow('hướng xử lý');
    const done = orders.transition(current.id, {
      to: 'Hoàn',
      ...COORDINATOR,
      handling: 'Đối soát xong, khách giữ hàng',
    });
    expect(done.state).toBe('Hoàn');
    expect(done.history.at(-1)).toMatchObject({
      to: 'Hoàn',
      handling: 'Đối soát xong, khách giữ hàng',
    });
    const lastAudit = audit.getAll().at(-1);
    expect(lastAudit?.detail).toContain('Hướng xử lý: Đối soát xong');
  });

  it('sửa khách của đơn mở thì được, ghi audit order.edit', () => {
    const { orders, audit } = buildServices();
    const order = orders.create(createInput('key-1'));
    const updated = orders.update(order.id, {
      customer: 'Hộ nước mắm B',
      ...COORDINATOR,
    });
    expect(updated.customer).toBe('Hộ nước mắm B');
    expect(updated.state).toBe('Mới tạo');
    expect(updated.history).toHaveLength(2);
    expect(
      audit.getAll().filter((record) => record.action === 'order.edit'),
    ).toHaveLength(1);
  });

  it('sửa mặt hàng trước khi đóng gói được, sau khi giữ hàng thì chặn', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    const renamed = orders.update(order.id, {
      items: [{ sku: 'NM-25', quantity: 1 }],
      ...COORDINATOR,
    });
    expect(renamed.items).toEqual([{ sku: 'NM-25', quantity: 1 }]);
    orders.transition(order.id, { to: 'Đã kiểm tra', ...COORDINATOR });
    orders.transition(order.id, { to: 'Chờ kho', ...COORDINATOR });
    orders.transition(order.id, { to: 'Đang đóng gói', ...WAREHOUSE });
    expect(() =>
      orders.update(order.id, {
        items: [{ sku: 'NM-40', quantity: 1 }],
        ...COORDINATOR,
      }),
    ).toThrow('đã giữ hàng');
    expect(orders.findOne(order.id).items).toEqual([
      { sku: 'NM-25', quantity: 1 },
    ]);
    const addressChanged = orders.update(order.id, {
      address: {
        province: 'Hải Phòng',
        district: 'Hồng Bàng',
        ward: 'Phường Hoàng Văn Thụ',
        street: 'Số 12 Lê Lợi',
      },
      ...COORDINATOR,
    });
    expect(addressChanged.addressTrust).toBe(100);
  });

  it('sửa địa chỉ tính lại mức tin cậy', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    const updated = orders.update(order.id, {
      address: { province: 'Hà Nội' },
      ...COORDINATOR,
    });
    expect(updated.addressTrust).toBe(40);
    expect(updated.addressLevel).toBe('Rủi ro cao');
  });

  it('sửa đơn đã đóng thiếu lý do hoặc người duyệt thì báo 400', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    orders.transition(order.id, { to: 'Hủy', ...COORDINATOR, reason: 'Khách đổi ý' });
    expect(() =>
      orders.update(order.id, { customer: 'Hộ khác', ...COORDINATOR }),
    ).toThrow('cần có lý do');
    expect(() =>
      orders.update(order.id, {
        customer: 'Hộ khác',
        reason: 'Sửa tên khách cho đúng sổ',
        ...COORDINATOR,
      }),
    ).toThrow('người phê duyệt');
  });

  it('sửa đơn đã đóng có lý do và người duyệt thì được, ghi audit riêng', () => {
    const { orders, audit } = buildServices();
    const order = orders.create(createInput('key-1'));
    orders.transition(order.id, { to: 'Hủy', ...COORDINATOR, reason: 'Khách đổi ý' });
    const updated = orders.update(order.id, {
      customer: 'Hộ nước mắm B',
      reason: 'Sửa tên khách cho đúng sổ',
      approvedBy: 'quan-ly',
      ...COORDINATOR,
    });
    expect(updated.customer).toBe('Hộ nước mắm B');
    expect(updated.history.at(-1)).toMatchObject({
      from: 'Hủy',
      to: 'Hủy',
      reason: 'Sửa tên khách cho đúng sổ',
    });
    const approved = audit
      .getAll()
      .filter((record) => record.action === 'order.edit.approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].detail).toContain('Người duyệt: quan-ly');
  });

  it('sửa đơn không có trường nào hoặc không tồn tại thì báo lỗi', () => {
    const { orders } = buildServices();
    const order = orders.create(createInput('key-1'));
    expect(() => orders.update(order.id, { ...COORDINATOR })).toThrow(
      'ít nhất 1 trường',
    );
    expect(() => orders.update('DH-9999', { customer: 'X', ...COORDINATOR })).toThrow(
      'Không tìm thấy đơn',
    );
  });

  it('không tìm thấy đơn thì báo 404', () => {
    const { orders } = buildServices();
    expect(() =>
      orders.transition('DH-9999', { to: 'Đã kiểm tra', ...COORDINATOR }),
    ).toThrow('Không tìm thấy đơn');
    expect(() => orders.findOne('DH-9999')).toThrow('Không tìm thấy đơn');
  });

  it('từ chối dữ liệu tạo đơn không hợp lệ', () => {
    const { orders } = buildServices();
    expect(() =>
      orders.create({ ...createInput('key-1'), customer: '' }),
    ).toThrow('customer là bắt buộc');
    expect(() =>
      orders.create({ ...createInput('key-1'), items: [] }),
    ).toThrow('items phải là mảng không rỗng');
    expect(() =>
      orders.create({
        ...createInput('key-1'),
        items: [{ sku: 'NM-40', quantity: 0 }],
      }),
    ).toThrow('số nguyên dương');
  });
});
