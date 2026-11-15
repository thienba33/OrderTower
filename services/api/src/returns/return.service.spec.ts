// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { DriversService } from '../drivers/driver.service';
import { InMemoryDriverStore } from '../drivers/driver.store';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/orders.types';
import { ShipmentsService } from '../shipments/shipment.service';
import { ShipmentGateAdapter } from '../shipments/shipment-gate.adapter';
import { InMemoryShipmentStore } from '../shipments/shipment.store';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { ReturnsService } from './return.service';
import { InMemoryReturnStore } from './return.store';

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  shipments: ShipmentsService;
  vehicles: VehiclesService;
  drivers: DriversService;
  returns: ReturnsService;
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
  // Cổng đọc shipment dùng chung kho với ShipmentsService, để rào chắn
  // bằng chứng shipment ở chuyển đơn thấy đúng trạng thái vừa lưu.
  const shipmentStore = new InMemoryShipmentStore();
  const gate = new ShipmentGateAdapter(shipmentStore);
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
    approvals,
    undefined,
    gate,
  );
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
    undefined,
  );
  const returns = new ReturnsService(
    orders,
    audit,
    new InMemoryReturnStore(),
  );
  await returns.onModuleInit();
  return { orders, audit, shipments, vehicles, drivers, returns };
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
const CSKH: Caller = {
  userId: 'user-lan',
  username: 'lan',
  roles: ['Nhân viên chăm sóc khách hàng'],
};
const MANAGER: Caller = {
  userId: 'user-quanly',
  username: 'quan-ly',
  roles: ['Quản lý'],
};
const ADMIN: Caller = {
  userId: 'user-admin',
  username: 'admin',
  roles: ['Quản trị viên'],
};

const ORDER_ADDRESS = {
  province: 'Hà Nội',
  district: 'Hai Bà Trưng',
  ward: 'Phường Phạm Đình Hổ',
  street: 'Số 8 phố Hàng Bè',
};

// Tạo đơn rồi đi tới "Chờ điều xe": tạo -> kiểm tra -> chờ kho -> đóng gói
// -> chờ điều xe. Địa chỉ đủ tin cậy, kho NM-40 còn hàng nên đi được.
async function createOrderReady(
  orders: OrdersService,
  key: string,
): Promise<Order> {
  const order = await orders.create(
    {
      idempotencyKey: key,
      customer: 'Hộ nước mắm A',
      items: [{ sku: 'NM-40', quantity: 2 }],
      address: ORDER_ADDRESS,
    },
    COORDINATOR,
  );
  const steps: Array<{ to: string; caller: Caller }> = [
    { to: 'Đã kiểm tra', caller: COORDINATOR },
    { to: 'Chờ kho', caller: COORDINATOR },
    { to: 'Đang đóng gói', caller: WAREHOUSE },
    { to: 'Chờ điều xe', caller: WAREHOUSE },
  ];
  for (const step of steps) {
    await orders.transition(order.id, { to: step.to }, step.caller);
  }
  return orders.findOne(order.id);
}

// Tạo đơn đã giao: đơn tới "Chờ điều xe" rồi điều xe và giao hàng qua
// shipment, đơn đi theo sang "Đã giao".
async function createDeliveredOrder(
  services: Awaited<ReturnType<typeof buildServices>>,
  key = 'key-1',
): Promise<Order> {
  const order = await createOrderReady(services.orders, key);
  const vehicle = await services.vehicles.create(
    { plate: '29A-12345', type: 'Xe máy' },
    COORDINATOR,
  );
  const driver = await services.drivers.create(
    { name: 'Nam', phone: '0901234567', username: 'nam' },
    COORDINATOR,
  );
  const shipment = await services.shipments.create(
    { orderId: order.id },
    COORDINATOR,
  );
  await services.shipments.dispatch(
    shipment.id,
    { driverId: driver.id, vehicleId: vehicle.id },
    COORDINATOR,
  );
  await services.shipments.deliver(
    shipment.id,
    { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
    DRIVER,
  );
  return services.orders.findOne(order.id);
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

async function deniedCount(audit: AuditService): Promise<number> {
  return actionCount(audit, 'return.transition.denied');
}

describe('ReturnsService', () => {
  it('tạo trả hàng ở trạng thái Chờ xử lý, ghi audit return.created', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    expect(order.state).toBe('Đã giao');
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý, hàng còn nguyên' },
      CSKH,
    );
    expect(ret.id).toBe('TH-1001');
    expect(ret.orderId).toBe(order.id);
    expect(ret.reason).toBe('Khách đổi ý, hàng còn nguyên');
    expect(ret.status).toBe('Chờ xử lý');
    expect(await actionCount(services.audit, 'return.created')).toBe(1);
    const created = (await services.audit.getAll()).find(
      (record) => record.action === 'return.created',
    );
    expect(created).toMatchObject({
      actor: 'lan',
      orderId: order.id,
      from: null,
      to: 'Chờ xử lý',
    });
  });

  it('tạo trả hàng bởi Điều phối viên thì báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    await expect(
      services.returns.create(
        { orderId: order.id, reason: 'Khách đổi ý' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Tạo trả hàng cần vai Nhân viên chăm sóc khách hàng');
    expect(await actionCount(services.audit, 'return.created')).toBe(0);
  });

  it('tạo trả hàng cho đơn không có thì 404, không ghi audit', async () => {
    const services = await buildServices();
    await expect(
      services.returns.create(
        { orderId: 'DH-9999', reason: 'Khách đổi ý' },
        CSKH,
      ),
    ).rejects.toThrow('Không tìm thấy đơn DH-9999');
    expect(await actionCount(services.audit, 'return.created')).toBe(0);
  });

  it('tạo trả hàng khi đơn chưa giao thì báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const order = await createOrderReady(services.orders, 'key-1');
    expect(order.state).toBe('Chờ điều xe');
    await expect(
      services.returns.create(
        { orderId: order.id, reason: 'Khách đổi ý' },
        CSKH,
      ),
    ).rejects.toThrow('chỉ tạo trả hàng khi đơn đã giao');
    expect(await actionCount(services.audit, 'return.created')).toBe(0);
  });

  it('tạo trả hàng thiếu lý do thì báo 400', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    await expect(
      services.returns.create({ orderId: order.id, reason: '  ' }, CSKH),
    ).rejects.toThrow('Tạo trả hàng cần có lý do');
    expect(await services.returns.list()).toHaveLength(0);
  });

  it('đơn đã có trả hàng đang xử lý thì tạo thêm báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await expect(
      services.returns.create(
        { orderId: order.id, reason: 'Hàng lỗi' },
        CSKH,
      ),
    ).rejects.toThrow('đã có trả hàng đang xử lý (TH-1001');
    expect(await actionCount(services.audit, 'return.created')).toBe(1);
  });

  it('đơn có trả hàng đã duyệt thì tạo thêm vẫn báo 409', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await services.returns.approve(ret.id, MANAGER);
    await expect(
      services.returns.create(
        { orderId: order.id, reason: 'Hàng lỗi' },
        CSKH,
      ),
    ).rejects.toThrow('đã có trả hàng đang xử lý (TH-1001');
  });

  it('duyệt trả hàng sang Đã duyệt, ghi audit return.approved', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    const approved = await services.returns.approve(ret.id, MANAGER);
    expect(approved.status).toBe('Đã duyệt');
    expect(await actionCount(services.audit, 'return.approved')).toBe(1);
    const record = (await services.audit.getAll()).find(
      (item) => item.action === 'return.approved',
    );
    expect(record).toMatchObject({
      actor: 'quan-ly',
      orderId: order.id,
      from: 'Chờ xử lý',
      to: 'Đã duyệt',
    });
  });

  it('quản trị viên cũng duyệt được trả hàng', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    const approved = await services.returns.approve(ret.id, ADMIN);
    expect(approved.status).toBe('Đã duyệt');
    expect(await actionCount(services.audit, 'return.approved')).toBe(1);
  });

  it('duyệt trả hàng đã duyệt thì báo 409, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await services.returns.approve(ret.id, MANAGER);
    await expect(services.returns.approve(ret.id, MANAGER)).rejects.toThrow(
      'chỉ duyệt trả hàng khi trả hàng ở "Chờ xử lý"',
    );
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('duyệt trả hàng bởi Điều phối viên thì báo 409, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await expect(
      services.returns.approve(ret.id, COORDINATOR),
    ).rejects.toThrow('Duyệt trả hàng cần vai Quản lý hoặc Quản trị viên');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('từ chối trả hàng thiếu lý do thì báo 400, đủ lý do thì sang Đã từ chối', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await expect(
      services.returns.reject(ret.id, { reason: '  ' }, MANAGER),
    ).rejects.toThrow('Từ chối trả hàng cần có lý do');
    const rejected = await services.returns.reject(
      ret.id,
      { reason: 'Hàng đã dùng, không nhận trả' },
      MANAGER,
    );
    expect(rejected.status).toBe('Đã từ chối');
    expect(await actionCount(services.audit, 'return.rejected')).toBe(1);
  });

  it('từ chối trả hàng đã duyệt thì báo 409, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await services.returns.approve(ret.id, MANAGER);
    await expect(
      services.returns.reject(
        ret.id,
        { reason: 'Hàng đã dùng' },
        MANAGER,
      ),
    ).rejects.toThrow('chỉ từ chối trả hàng khi trả hàng ở "Chờ xử lý"');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('hoàn tiền từ Đã duyệt sang Đã hoàn tiền, ghi audit return.refunded', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await services.returns.approve(ret.id, MANAGER);
    const refunded = await services.returns.refund(ret.id, COORDINATOR);
    expect(refunded.status).toBe('Đã hoàn tiền');
    expect(await actionCount(services.audit, 'return.refunded')).toBe(1);
    const record = (await services.audit.getAll()).find(
      (item) => item.action === 'return.refunded',
    );
    expect(record).toMatchObject({
      actor: 'son',
      orderId: order.id,
      from: 'Đã duyệt',
      to: 'Đã hoàn tiền',
    });
  });

  it('hoàn tiền khi trả hàng mới Chờ xử lý thì báo 409, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await expect(services.returns.refund(ret.id, COORDINATOR)).rejects.toThrow(
      'chỉ hoàn tiền trả hàng khi trả hàng ở "Đã duyệt"',
    );
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('hoàn tiền bởi Quản lý thì báo 409, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await services.returns.approve(ret.id, MANAGER);
    await expect(services.returns.refund(ret.id, MANAGER)).rejects.toThrow(
      'Hoàn tiền trả hàng cần vai Điều phối viên',
    );
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('đơn có trả hàng đã từ chối hoặc đã hoàn tiền thì tạo trả hàng mới được', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const first = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await services.returns.reject(
      first.id,
      { reason: 'Hàng đã dùng, không nhận trả' },
      MANAGER,
    );
    const second = await services.returns.create(
      { orderId: order.id, reason: 'Hàng lỗi thật, khách gửi ảnh' },
      CSKH,
    );
    expect(second.id).toBe('TH-1002');
    expect(second.status).toBe('Chờ xử lý');
    await services.returns.approve(second.id, MANAGER);
    await services.returns.refund(second.id, COORDINATOR);
    const third = await services.returns.create(
      { orderId: order.id, reason: 'Khách trả nốt phần còn lại' },
      CSKH,
    );
    expect(third.id).toBe('TH-1003');
  });

  it('get không tìm thấy thì 404, list lọc theo orderId và status', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services);
    const ret = await services.returns.create(
      { orderId: order.id, reason: 'Khách đổi ý' },
      CSKH,
    );
    await expect(services.returns.get('TH-9999')).rejects.toThrow(
      'Không tìm thấy trả hàng TH-9999',
    );
    expect(await services.returns.list()).toHaveLength(1);
    expect(
      await services.returns.list({ orderId: order.id }),
    ).toHaveLength(1);
    expect(
      await services.returns.list({ orderId: 'DH-9999' }),
    ).toHaveLength(0);
    expect(
      await services.returns.list({ status: 'Chờ xử lý' }),
    ).toHaveLength(1);
    expect(
      await services.returns.list({ status: 'Đã hoàn tiền' }),
    ).toHaveLength(0);
    await services.returns.approve(ret.id, MANAGER);
    expect(
      await services.returns.list({ status: 'Đã duyệt' }),
    ).toHaveLength(1);
    expect(
      await services.returns.list({ status: 'Chờ xử lý' }),
    ).toHaveLength(0);
  });
});
