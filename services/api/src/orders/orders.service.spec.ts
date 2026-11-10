// SPDX-License-Identifier: Apache-2.0
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { WorkflowService } from '../workflow/workflow.service';
import { OrdersService } from './orders.service';

function buildServices(): {
  orders: OrdersService;
  audit: AuditService;
  inventory: InventoryService;
} {
  const workflow = new WorkflowService();
  workflow.onModuleInit();
  const audit = new AuditService();
  const inventory = new InventoryService();
  inventory.onModuleInit();
  const orders = new OrdersService(workflow, audit, inventory);
  return { orders, audit, inventory };
}

function createInput(key: string) {
  return {
    idempotencyKey: key,
    customer: 'Hộ nước mắm A',
    items: [{ sku: 'NM-40', quantity: 2 }],
    actor: 'son',
    role: 'Điều phối viên',
  };
}

const COORDINATOR = { actor: 'son', role: 'Điều phối viên' };
const WAREHOUSE = { actor: 'minh', role: 'Nhân viên kho' };
const DRIVER = { actor: 'nam', role: 'Tài xế' };

describe('OrdersService', () => {
  it('tạo đơn ở trạng thái Mới tạo, ghi lịch sử và audit', () => {
    const { orders, audit } = buildServices();
    const order = orders.create(createInput('key-1'));
    expect(order.id).toBe('DH-1001');
    expect(order.state).toBe('Mới tạo');
    expect(order.history).toHaveLength(1);
    expect(order.history[0]).toMatchObject({ from: null, to: 'Mới tạo' });
    expect(audit.getAll()).toHaveLength(1);
    expect(audit.getAll()[0].action).toBe('order.created');
  });

  it('từ chối đơn trùng idempotencyKey', () => {
    const { orders, audit } = buildServices();
    orders.create(createInput('key-1'));
    expect(() => orders.create(createInput('key-1'))).toThrow('đã tồn tại');
    expect(orders.list()).toHaveLength(1);
    expect(audit.getAll()).toHaveLength(1);
  });

  it('đơn đi tròn 9 trạng thái tới Hoàn', () => {
    const { orders, audit } = buildServices();
    const order = orders.create(createInput('key-1'));
    const steps: Array<{ to: string; actor: string; role: string }> = [
      { to: 'Đã kiểm tra', ...COORDINATOR },
      { to: 'Chờ kho', ...COORDINATOR },
      { to: 'Đang đóng gói', ...WAREHOUSE },
      { to: 'Chờ điều xe', ...WAREHOUSE },
      { to: 'Đang giao', ...COORDINATOR },
      { to: 'Đã giao', ...DRIVER },
      { to: 'Hoàn', ...COORDINATOR },
    ];
    let current = order;
    for (const step of steps) {
      current = orders.transition(current.id, step);
    }
    expect(current.state).toBe('Hoàn');
    expect(current.history).toHaveLength(8);
    expect(audit.getAll()).toHaveLength(8);
    expect(audit.verify().valid).toBe(true);
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
