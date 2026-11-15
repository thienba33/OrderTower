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
import { ChannelsService } from '../channels/channel.service';
import {
  InMemoryChannelStore,
  PostgresChannelStore,
} from '../channels/channel.store';
import { CustomersService } from '../customers/customer.service';
import {
  InMemoryCustomerStore,
  PostgresCustomerStore,
} from '../customers/customer.store';
import { DbService } from '../db/db.service';
import { createTestDbService } from '../db/test-helpers';
import { InventoryService } from '../inventory/inventory.service';
import { PostgresInventoryStore } from '../inventory/inventory.store';
import { ShipmentsService } from '../shipments/shipment.service';
import { InMemoryShipmentStore } from '../shipments/shipment.store';
import { DriversService } from '../drivers/driver.service';
import { InMemoryDriverStore } from '../drivers/driver.store';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import { WorkflowInstanceService } from '../workflow/instance.service';
import {
  InMemoryWorkflowInstanceStore,
  PostgresWorkflowInstanceStore,
} from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import type { OrderShipmentEvidence } from './order-shipment-gate';
import { OrdersService } from './orders.service';
import { PostgresOrderStore } from './orders.store';

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  inventory: InventoryService;
  instances: WorkflowInstanceService;
  approvals: ApprovalService;
  shipments: ShipmentsService;
  vehicles: VehiclesService;
  drivers: DriversService;
  channels: ChannelsService;
  customers: CustomersService;
  workflow: WorkflowService;
  address: AddressService;
  // Cổng bằng chứng dùng stub đổi được, để kiểm thử rào chắn trực tiếp
  // mà không cần tạo shipment thật.
  evidence: OrderShipmentEvidence[];
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
  const channels = new ChannelsService(audit, new InMemoryChannelStore());
  await channels.onModuleInit();
  const customers = new CustomersService(
    audit,
    new InMemoryCustomerStore(),
  );
  await customers.onModuleInit();
  // Cổng bằng chứng dùng stub đổi được (để kiểm thử rào chắn trực tiếp)
  // GỘP với kho shipment thật, để chuyển đơn theo sự kiện shipment thật
  // cũng thấy bằng chứng vừa lưu.
  const evidence: OrderShipmentEvidence[] = [];
  const shipmentStore = new InMemoryShipmentStore();
  const gate = {
    findByOrderId: async (orderId: string) => {
      const fromStore = await shipmentStore.findByOrderId(orderId);
      return [
        ...fromStore.map((shipment) => ({
          status: shipment.status,
          proofPhotoKey: shipment.proofPhotoKey,
        })),
        ...evidence,
      ];
    },
  };
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
    approvals,
    undefined,
    gate,
    channels,
    customers,
  );
  // Xe và tài xế dùng chung cho ShipmentsService: dispatch chỉ nhận xe
  // thật và tài xế thật nên kiểm thử điều xe phải tạo xe và tài xế trước,
  // giống chạy thật qua mô-đun.
  const vehicles = new VehiclesService(audit, new InMemoryVehicleStore());
  await vehicles.onModuleInit();
  const drivers = new DriversService(
    audit,
    new InMemoryDriverStore(),
    vehicles,
  );
  await drivers.onModuleInit();
  const shipments = new ShipmentsService(
    orders,
    audit,
    workflow,
    shipmentStore,
    vehicles,
    drivers,
  );
  return {
    orders,
    audit,
    inventory,
    instances,
    approvals,
    shipments,
    vehicles,
    drivers,
    channels,
    customers,
    workflow,
    address,
    evidence,
  };
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
    const { orders, audit, instances, shipments, vehicles, drivers } =
      await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    const steps: Array<{
      to: string;
      caller: Caller;
    }> = [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
    ];
    let current = order;
    for (const step of steps) {
      current = await orders.transition(current.id, { to: step.to }, step.caller);
    }
    // Hai chuyển qua vùng giao hàng đi qua shipment: điều xe rồi giao hàng
    // có bằng chứng, đơn đi theo từng bước.
    const shipment = await shipments.create({ orderId: order.id }, COORDINATOR);
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    // Tài xế username 'nam' khớp caller DRIVER dùng lúc giao hàng, để
    // kiểm tra quyền sở hữu thấy đúng người gọi.
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    current = await orders.findOne(order.id);
    expect(current.state).toBe('Đang giao');
    await shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
      DRIVER,
    );
    current = await orders.findOne(order.id);
    expect(current.state).toBe('Đã giao');
    current = await orders.transition(
      current.id,
      { to: 'Hoàn', handling: 'Đối soát xong, khách giữ hàng' },
      COORDINATOR,
    );
    expect(current.state).toBe('Hoàn');
    expect(current.history).toHaveLength(8);
    // 2 lúc tạo + 4 chuyển đầu + tạo xe 1 + tạo tài xế 1 + tạo shipment 1
    // + điều xe 2 (shipment + chuyển đơn) + giao hàng 2 (shipment +
    // chuyển đơn) + đóng đơn 1.
    expect(await audit.getAll()).toHaveLength(14);
    expect((await audit.verify()).valid).toBe(true);
    const instance = await instances.findByBusinessKey('order-flow', order.id);
    expect(instance?.status).toBe('completed');
    expect(instance?.history).toHaveLength(8);
    expect(instance?.currentState).toBe('Hoàn');
  });

  it('chuyển sang Đang giao thiếu shipment thì chặn 409, có shipment đang giao thì qua', async () => {
    const { orders, audit, evidence } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    for (const step of [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
    ]) {
      await orders.transition(order.id, { to: step.to }, step.caller);
    }
    await expect(
      orders.transition(order.id, { to: 'Đang giao' }, COORDINATOR),
    ).rejects.toThrow('chưa điều xe');
    expect((await orders.findOne(order.id)).state).toBe('Chờ điều xe');
    const denied = (await audit.getAll()).filter(
      (record) => record.action === 'order.transition.denied',
    );
    expect(denied).toHaveLength(1);
    // Shipment chỉ ở Chờ điều xe thì vẫn chưa đủ: cần shipment Đang giao.
    evidence.push({ status: 'Chờ điều xe', proofPhotoKey: null });
    await expect(
      orders.transition(order.id, { to: 'Đang giao' }, COORDINATOR),
    ).rejects.toThrow('chưa điều xe');
    evidence.push({ status: 'Đang giao', proofPhotoKey: null });
    const moved = await orders.transition(
      order.id,
      { to: 'Đang giao' },
      COORDINATOR,
    );
    expect(moved.state).toBe('Đang giao');
  });

  it('chuyển sang Đã giao thiếu shipment đã giao có bằng chứng thì chặn 409', async () => {
    const { orders, audit, evidence } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    for (const step of [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
    ]) {
      await orders.transition(order.id, { to: step.to }, step.caller);
    }
    evidence.push({ status: 'Đang giao', proofPhotoKey: null });
    await orders.transition(order.id, { to: 'Đang giao' }, COORDINATOR);
    // Shipment đang giao nhưng chưa giao xong thì chưa đủ.
    await expect(
      orders.transition(order.id, { to: 'Đã giao' }, DRIVER),
    ).rejects.toThrow('chưa có bằng chứng giao hàng');
    // Shipment đã giao nhưng không có ảnh bằng chứng thì vẫn chặn.
    evidence.push({ status: 'Đã giao', proofPhotoKey: null });
    await expect(
      orders.transition(order.id, { to: 'Đã giao' }, DRIVER),
    ).rejects.toThrow('chưa có bằng chứng giao hàng');
    const denied = (await audit.getAll()).filter(
      (record) => record.action === 'order.transition.denied',
    );
    expect(denied).toHaveLength(2);
    evidence.push({
      status: 'Đã giao',
      proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg',
    });
    const moved = await orders.transition(order.id, { to: 'Đã giao' }, DRIVER);
    expect(moved.state).toBe('Đã giao');
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

  it('tạo đơn có phone và deadline, total tính từ giá tồn kho', async () => {
    const { orders, audit } = await buildServices();
    const order = await orders.create(
      {
        ...createInput('key-1'),
        phone: ' 0901234567 ',
        deadline: '2026-11-20T10:00:00.000Z',
        items: [{ sku: 'NM-25', quantity: 2 }],
      },
      COORDINATOR,
    );
    expect(order.phone).toBe('0901234567');
    expect(order.deadline).toBe('2026-11-20T10:00:00.000Z');
    // NM-25 93000 x 2 = 186000.
    expect(order.total).toBe(186000);
    expect(await audit.getAll()).toHaveLength(2);
  });

  it('tạo đơn không có phone/deadline thì null, total tính từ items', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.phone).toBeNull();
    expect(order.deadline).toBeNull();
    // NM-40 142000 x 2 = 284000.
    expect(order.total).toBe(284000);
    const blank = await orders.create(
      {
        ...createInput('key-2'),
        phone: '   ',
        deadline: '',
      },
      COORDINATOR,
    );
    expect(blank.phone).toBeNull();
    expect(blank.deadline).toBeNull();
    expect(blank.total).toBe(284000);
  });

  it('deadline sai thì 400, đơn không được tạo', async () => {
    const { orders } = await buildServices();
    await expect(
      orders.create(
        { ...createInput('key-1'), deadline: 'không phải ngày' },
        COORDINATOR,
      ),
    ).rejects.toThrow('không parse được');
    expect(await orders.list()).toHaveLength(0);
  });

  it('đơn chứa SKU không giá thì total chỉ tính phần có giá', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(
      {
        ...createInput('key-1'),
        items: [
          { sku: 'NM-25', quantity: 1 },
          { sku: 'MT-08', quantity: 2 },
        ],
      },
      COORDINATOR,
    );
    // NM-25 93000 x 1 + MT-08 chưa có giá x 2 = 93000.
    expect(order.total).toBe(93000);
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
    const { orders, audit, shipments, vehicles, drivers } =
      await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    const steps: Array<{ to: string; caller: Caller }> = [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
    ];
    let current = order;
    for (const step of steps) {
      current = await orders.transition(
        current.id,
        { to: step.to },
        step.caller,
      );
    }
    const shipment = await shipments.create({ orderId: order.id }, COORDINATOR);
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
      DRIVER,
    );
    current = await orders.findOne(order.id);
    expect(current.state).toBe('Đã giao');
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

  it('PATCH đổi phone và deadline, total không đổi', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.total).toBe(284000);
    const updated = await orders.update(
      order.id,
      { phone: '0901234567', deadline: '2026-11-21T09:30:00.000Z' },
      COORDINATOR,
    );
    expect(updated.phone).toBe('0901234567');
    expect(updated.deadline).toBe('2026-11-21T09:30:00.000Z');
    expect(updated.total).toBe(284000);
  });

  it('PATCH null gỡ phone và deadline', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(
      {
        ...createInput('key-1'),
        phone: '0901234567',
        deadline: '2026-11-20T10:00:00.000Z',
      },
      COORDINATOR,
    );
    const updated = await orders.update(
      order.id,
      { phone: null, deadline: null },
      COORDINATOR,
    );
    expect(updated.phone).toBeNull();
    expect(updated.deadline).toBeNull();
  });

  it('PATCH đổi items tính lại total', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.total).toBe(284000);
    const updated = await orders.update(
      order.id,
      { items: [{ sku: 'NM-25', quantity: 1 }] },
      COORDINATOR,
    );
    expect(updated.items).toEqual([{ sku: 'NM-25', quantity: 1 }]);
    expect(updated.total).toBe(93000);
  });

  it('PATCH deadline sai thì 400, đơn giữ nguyên', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(
      { ...createInput('key-1'), deadline: '2026-11-20T10:00:00.000Z' },
      COORDINATOR,
    );
    await expect(
      orders.update(order.id, { deadline: 'ngày mai nhé' }, COORDINATOR),
    ).rejects.toThrow('không parse được');
    expect((await orders.findOne(order.id)).deadline).toBe(
      '2026-11-20T10:00:00.000Z',
    );
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

  it('tạo đơn kèm kênh Chat thì lưu channelId, không ghi thêm audit', async () => {
    const { orders, audit } = await buildServices();
    const order = await orders.create(
      { ...createInput('key-1'), channelId: 'K-1001' },
      COORDINATOR,
    );
    expect(order.channelId).toBe('K-1001');
    expect(await audit.getAll()).toHaveLength(2);
    expect((await audit.getAll()).map((record) => record.action)).toEqual([
      'workflow.instance.started',
      'order.created',
    ]);
  });

  it('tạo đơn không kèm kênh thì channelId null', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.channelId).toBeNull();
  });

  it('tạo đơn kèm kênh không có thì 404', async () => {
    const { orders } = await buildServices();
    await expect(
      orders.create(
        { ...createInput('key-1'), channelId: 'K-9999' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Không tìm thấy kênh K-9999');
    expect(await orders.list()).toHaveLength(0);
  });

  it('tạo đơn kèm kênh tạm dừng thì 409, không ghi audit', async () => {
    const { orders, audit, channels } = await buildServices();
    await channels.pause('K-1002', COORDINATOR);
    await expect(
      orders.create(
        { ...createInput('key-1'), channelId: 'K-1002' },
        COORDINATOR,
      ),
    ).rejects.toThrow('chỉ nhận đơn khi kênh đang hoạt động');
    expect(await orders.list()).toHaveLength(0);
    expect(
      (await audit.getAll()).filter(
        (record) => record.action === 'order.created',
      ),
    ).toHaveLength(0);
  });

  it('tạo đơn kèm kênh khi mô-đun kênh vắng mặt thì 409', async () => {
    const { workflow, audit, inventory, address, instances, approvals } =
      await buildServices();
    const orders = new OrdersService(
      workflow,
      audit,
      inventory,
      address,
      instances,
      approvals,
      undefined,
      undefined,
    );
    await expect(
      orders.create(
        { ...createInput('key-1'), channelId: 'K-1001' },
        COORDINATOR,
      ),
    ).rejects.toThrow('mô-đun kênh chưa được nối');
  });

  it('PATCH đổi kênh ở đơn mở, gỡ kênh bằng null, kênh sai thì chặn', async () => {
    const { orders, channels } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.channelId).toBeNull();
    const withChannel = await orders.update(
      order.id,
      { channelId: 'K-1001' },
      COORDINATOR,
    );
    expect(withChannel.channelId).toBe('K-1001');
    const cleared = await orders.update(
      order.id,
      { channelId: null },
      COORDINATOR,
    );
    expect(cleared.channelId).toBeNull();
    await expect(
      orders.update(order.id, { channelId: 'K-9999' }, COORDINATOR),
    ).rejects.toThrow('Không tìm thấy kênh K-9999');
    await channels.pause('K-1002', COORDINATOR);
    await expect(
      orders.update(order.id, { channelId: 'K-1002' }, COORDINATOR),
    ).rejects.toThrow('chỉ nhận đơn khi kênh đang hoạt động');
    expect((await orders.findOne(order.id)).channelId).toBeNull();
  });

  it('list lọc theo channelId', async () => {
    const { orders } = await buildServices();
    await orders.create(
      { ...createInput('key-1'), channelId: 'K-1001' },
      COORDINATOR,
    );
    await orders.create(
      { ...createInput('key-2'), channelId: 'K-1002' },
      COORDINATOR,
    );
    await orders.create(createInput('key-3'), COORDINATOR);
    expect(await orders.list()).toHaveLength(3);
    expect(
      (await orders.list({ channelId: 'K-1001' })).map(
        (order) => order.id,
      ),
    ).toEqual(['DH-1001']);
    expect(
      (await orders.list({ channelId: 'K-1002' })).map(
        (order) => order.id,
      ),
    ).toEqual(['DH-1002']);
    expect(await orders.list({ channelId: 'K-9999' })).toHaveLength(0);
  });

  it('tạo đơn kèm khách hàng KH-1001 thì lưu customerId, không ghi thêm audit', async () => {
    const { orders, audit, customers } = await buildServices();
    const customer = await customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    expect(customer.id).toBe('KH-1001');
    const order = await orders.create(
      { ...createInput('key-1'), customerId: 'KH-1001' },
      COORDINATOR,
    );
    expect(order.customerId).toBe('KH-1001');
    expect((await audit.getAll()).map((record) => record.action)).toEqual([
      'customer.created',
      'workflow.instance.started',
      'order.created',
    ]);
  });

  it('tạo đơn không kèm khách hàng thì customerId null', async () => {
    const { orders } = await buildServices();
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.customerId).toBeNull();
  });

  it('tạo đơn kèm khách hàng không có thì 404', async () => {
    const { orders } = await buildServices();
    await expect(
      orders.create(
        { ...createInput('key-1'), customerId: 'KH-9999' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Không tìm thấy khách hàng KH-9999');
    expect(await orders.list()).toHaveLength(0);
  });

  it('tạo đơn kèm customerId rỗng thì 400', async () => {
    const { orders } = await buildServices();
    await expect(
      orders.create(
        { ...createInput('key-1'), customerId: '   ' },
        COORDINATOR,
      ),
    ).rejects.toThrow('customerId phải là chuỗi không rỗng');
    expect(await orders.list()).toHaveLength(0);
  });

  it('tạo đơn kèm khách hàng khi mô-đun khách hàng vắng mặt thì 409', async () => {
    const { workflow, audit, inventory, address, instances, approvals, channels } =
      await buildServices();
    const orders = new OrdersService(
      workflow,
      audit,
      inventory,
      address,
      instances,
      approvals,
      undefined,
      undefined,
      channels,
    );
    await expect(
      orders.create(
        { ...createInput('key-1'), customerId: 'KH-1001' },
        COORDINATOR,
      ),
    ).rejects.toThrow('mô-đun khách hàng chưa được nối');
  });

  it('PATCH đổi khách hàng ở đơn mở, gỡ bằng null, khách sai thì chặn', async () => {
    const { orders, customers } = await buildServices();
    await customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    expect(order.customerId).toBeNull();
    const withCustomer = await orders.update(
      order.id,
      { customerId: 'KH-1001' },
      COORDINATOR,
    );
    expect(withCustomer.customerId).toBe('KH-1001');
    const cleared = await orders.update(
      order.id,
      { customerId: null },
      COORDINATOR,
    );
    expect(cleared.customerId).toBeNull();
    await expect(
      orders.update(order.id, { customerId: 'KH-9999' }, COORDINATOR),
    ).rejects.toThrow('Không tìm thấy khách hàng KH-9999');
    expect((await orders.findOne(order.id)).customerId).toBeNull();
  });

  it('PATCH khách hàng sai ở đơn đã đóng thì chặn trước khi tiêu phê duyệt', async () => {
    const { orders, approvals, customers } = await buildServices();
    await customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    const order = await orders.create(createInput('key-1'), COORDINATOR);
    await orders.transition(order.id, { to: 'Hủy', reason: 'Khách đổi ý' }, COORDINATOR);
    const approval = await approvals.request(
      {
        type: 'order.edit.closed',
        subjectId: order.id,
        reason: 'Gắn khách cho đúng sổ',
      },
      COORDINATOR,
    );
    await approvals.approve(approval.id, MANAGER, 'Đồng ý');
    await expect(
      orders.update(
        order.id,
        {
          customerId: 'KH-9999',
          reason: 'Gắn khách cho đúng sổ',
          approvalId: approval.id,
        },
        COORDINATOR,
      ),
    ).rejects.toThrow('Không tìm thấy khách hàng KH-9999');
    // Phê duyệt chưa bị tiêu vì kiểm tra khách chạy trước.
    expect((await approvals.get(approval.id)).appliedAt).toBeNull();
  });

  it('list lọc theo customerId', async () => {
    const { orders, customers } = await buildServices();
    await customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    await customers.create(
      { name: 'Hộ nước mắm B', phone: '0901234568' },
      COORDINATOR,
    );
    await orders.create(
      { ...createInput('key-1'), customerId: 'KH-1001' },
      COORDINATOR,
    );
    await orders.create(
      { ...createInput('key-2'), customerId: 'KH-1002' },
      COORDINATOR,
    );
    await orders.create(createInput('key-3'), COORDINATOR);
    expect(await orders.list()).toHaveLength(3);
    expect(
      (await orders.list({ customerId: 'KH-1001' })).map(
        (order) => order.id,
      ),
    ).toEqual(['DH-1001']);
    expect(
      (await orders.list({ customerId: 'KH-1002' })).map(
        (order) => order.id,
      ),
    ).toEqual(['DH-1002']);
    expect(await orders.list({ customerId: 'KH-9999' })).toHaveLength(0);
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
    const channels = new ChannelsService(
      audit,
      new PostgresChannelStore(db),
    );
    await channels.onModuleInit();
    const customers = new CustomersService(
      audit,
      new PostgresCustomerStore(db),
    );
    await customers.onModuleInit();
    const store = new PostgresOrderStore(db);
    const orders = new OrdersService(
      workflow,
      audit,
      inventory,
      address,
      instances,
      approvals,
      store,
      undefined,
      channels,
      customers,
    );
    await orders.onModuleInit();
    return { db, orders, audit, inventory, instances, approvals, store, channels, customers };
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

  it('tạo đơn kèm kênh rồi đọc lại, channelId lưu bền qua khởi động lại', async () => {
    const first = await buildPostgresStack();
    const one = await first.orders.create(
      { ...createInput('key-1'), channelId: 'K-1001' },
      COORDINATOR,
    );
    expect(one.id).toBe('DH-1001');
    expect(one.channelId).toBe('K-1001');
    const loaded = await first.store.findById('DH-1001');
    expect(loaded).toEqual(one);
    // Mô phỏng khởi động lại: service mới, cùng kho Postgres.
    const second = await buildPostgresStack(first.db);
    const reopened = await second.orders.findOne('DH-1001');
    expect(reopened.channelId).toBe('K-1001');
    // Kênh mẫu vẫn còn sau khi khởi động lại, không nạp seed lại.
    expect(
      (await second.channels.list()).map((channel) => channel.id),
    ).toEqual(['K-1001', 'K-1002', 'K-1003']);
    // Kênh tạo tay tiếp theo nối số thứ tự K-1004.
    const next = await second.channels.create(
      { name: 'Sàn thương mại' },
      COORDINATOR,
    );
    expect(next.id).toBe('K-1004');
  });

  it('tạo đơn kèm khách hàng rồi đọc lại, customerId lưu bền qua khởi động lại', async () => {
    const first = await buildPostgresStack();
    const customer = await first.customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    expect(customer.id).toBe('KH-1001');
    const one = await first.orders.create(
      { ...createInput('key-1'), customerId: 'KH-1001' },
      COORDINATOR,
    );
    expect(one.id).toBe('DH-1001');
    expect(one.customerId).toBe('KH-1001');
    const loaded = await first.store.findById('DH-1001');
    expect(loaded).toEqual(one);
    // Mô phỏng khởi động lại: service mới, cùng kho Postgres.
    const second = await buildPostgresStack(first.db);
    const reopened = await second.orders.findOne('DH-1001');
    expect(reopened.customerId).toBe('KH-1001');
    // Khách hàng vẫn còn sau khi khởi động lại; khách tiếp theo nối số
    // thứ tự KH-1002.
    expect(await second.customers.get('KH-1001')).toMatchObject({
      name: 'Hộ nước mắm A',
      phone: '0901234567',
    });
    const next = await second.customers.create(
      { name: 'Hộ nước mắm B', phone: '0901234568' },
      COORDINATOR,
    );
    expect(next.id).toBe('KH-1002');
  });

  it('tạo đơn có phone/deadline/total rồi đọc lại, lưu bền qua khởi động lại', async () => {
    const first = await buildPostgresStack();
    const one = await first.orders.create(
      {
        ...createInput('key-1'),
        phone: '0901234567',
        deadline: '2026-11-20T10:00:00.000Z',
        items: [{ sku: 'NM-25', quantity: 2 }],
      },
      COORDINATOR,
    );
    expect(one.id).toBe('DH-1001');
    expect(one.phone).toBe('0901234567');
    expect(one.deadline).toBe('2026-11-20T10:00:00.000Z');
    expect(one.total).toBe(186000);
    const loaded = await first.store.findById('DH-1001');
    expect(loaded).toEqual(one);
    // Mô phỏng khởi động lại: service mới, cùng kho Postgres.
    const second = await buildPostgresStack(first.db);
    const reopened = await second.orders.findOne('DH-1001');
    expect(reopened.phone).toBe('0901234567');
    expect(reopened.deadline).toBe('2026-11-20T10:00:00.000Z');
    expect(reopened.total).toBe(186000);
  });
});
