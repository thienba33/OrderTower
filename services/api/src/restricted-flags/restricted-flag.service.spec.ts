// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { DriversService } from '../drivers/driver.service';
import { InMemoryDriverStore } from '../drivers/driver.store';
import type { Driver } from '../drivers/driver.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { InMemoryOrderStore } from '../orders/orders.store';
import type { Order } from '../orders/orders.types';
import { ReturnsService } from '../returns/return.service';
import { InMemoryReturnStore } from '../returns/return.store';
import type { Return } from '../returns/return.types';
import { ShipmentsService } from '../shipments/shipment.service';
import { ShipmentGateAdapter } from '../shipments/shipment-gate.adapter';
import { InMemoryShipmentStore } from '../shipments/shipment.store';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import type { Vehicle } from '../vehicles/vehicle.types';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { RestrictedFlagsService } from './restricted-flag.service';
import { InMemoryRestrictedFlagStore } from './restricted-flag.store';

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  shipments: ShipmentsService;
  vehicles: VehiclesService;
  drivers: DriversService;
  returns: ReturnsService;
  flags: RestrictedFlagsService;
  orderStore: InMemoryOrderStore;
  returnStore: InMemoryReturnStore;
  vehicle: Vehicle;
  driver: Driver;
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
  const orderStore = new InMemoryOrderStore();
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
    approvals,
    orderStore,
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
  const returnStore = new InMemoryReturnStore();
  const returns = new ReturnsService(orders, audit, returnStore);
  await returns.onModuleInit();
  const flags = new RestrictedFlagsService(
    orders,
    returns,
    audit,
    new InMemoryRestrictedFlagStore(),
  );
  await flags.onModuleInit();
  // 1 xe và 1 tài xế dùng chung cho mọi đơn đã giao trong 1 test: biển số
  // và username là duy nhất nên không tạo mới mỗi lần; giao xong thì cả 2
  // lại rảnh nên dùng tiếp được.
  const vehicle = await vehicles.create(
    { plate: '29A-12345', type: 'Xe máy' },
    COORDINATOR,
  );
  const driver = await drivers.create(
    { name: 'Nam', phone: '0901234567', username: 'nam' },
    COORDINATOR,
  );
  return {
    orders,
    audit,
    shipments,
    vehicles,
    drivers,
    returns,
    flags,
    orderStore,
    returnStore,
    vehicle,
    driver,
  };
}

type Services = Awaited<ReturnType<typeof buildServices>>;

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

const PHONE_A = '0901111111';
const PHONE_B = '0902222222';

// Tạo đơn rồi đi tới "Chờ điều xe": tạo -> kiểm tra -> chờ kho -> đóng gói
// -> chờ điều xe. Địa chỉ đủ tin cậy, kho NM-40 còn hàng nên đi được.
async function createOrderReady(
  services: Services,
  key: string,
  phone?: string,
): Promise<Order> {
  const order = await services.orders.create(
    {
      idempotencyKey: key,
      customer: 'Hộ nước mắm A',
      phone,
      items: [{ sku: 'NM-40', quantity: 1 }],
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
    await services.orders.transition(order.id, { to: step.to }, step.caller);
  }
  return services.orders.findOne(order.id);
}

// Tạo đơn đã giao: đơn tới "Chờ điều xe" rồi điều xe và giao hàng qua
// shipment, đơn đi theo sang "Đã giao". Dùng chung 1 xe và 1 tài xế đã
// tạo ở buildServices vì giao xong thì cả 2 lại rảnh.
async function createDeliveredOrder(
  services: Services,
  key: string,
  phone?: string,
): Promise<Order> {
  const order = await createOrderReady(services, key, phone);
  const shipment = await services.shipments.create(
    { orderId: order.id },
    COORDINATOR,
  );
  await services.shipments.dispatch(
    shipment.id,
    { driverId: services.driver.id, vehicleId: services.vehicle.id },
    COORDINATOR,
  );
  await services.shipments.deliver(
    shipment.id,
    { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
    DRIVER,
  );
  return services.orders.findOne(order.id);
}

// Tạo trả hàng cho đơn đã giao.
async function createReturn(
  services: Services,
  orderId: string,
): Promise<Return> {
  return services.returns.create(
    { orderId, reason: 'Khách đổi ý, hàng còn nguyên' },
    CSKH,
  );
}

// Dời ngày tạo của đơn/trả hàng về quá khứ để kiểm tra cửa sổ 30/90 ngày
// của tỷ lệ hoàn: lưu lại bản sao với createdAt/updatedAt đã dời.
async function backdateOrder(
  services: Services,
  orderId: string,
  daysAgo: number,
): Promise<void> {
  const order = await services.orders.findOne(orderId);
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await services.orderStore.save({
    ...order,
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  });
}

async function backdateReturn(
  services: Services,
  returnId: string,
  daysAgo: number,
): Promise<void> {
  const ret = await services.returns.get(returnId);
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await services.returnStore.save({
    ...ret,
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  });
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

async function deniedCount(audit: AuditService): Promise<number> {
  return actionCount(audit, 'restricted-flag.transition.denied');
}

describe('RestrictedFlagsService', () => {
  it('tạo cờ ở trạng thái Hoàn nhiều lần, nguồn CSKH, chụp SĐT từ đơn, ghi audit', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create(
      { orderId: order.id, reason: 'Hoàn 3 lần trong tháng' },
      CSKH,
    );
    expect(flag.id).toBe('HG-1001');
    expect(flag.orderId).toBe(order.id);
    expect(flag.customerId).toBeNull();
    expect(flag.customerPhone).toBe(PHONE_A);
    expect(flag.status).toBe('Hoàn nhiều lần');
    expect(flag.source).toBe('CSKH');
    expect(flag.reason).toBe('Hoàn 3 lần trong tháng');
    expect(flag.createdBy).toBe('lan');
    expect(flag.decidedBy).toBeNull();
    expect(flag.decidedAt).toBeNull();
    expect(await actionCount(services.audit, 'restricted-flag.created')).toBe(
      1,
    );
  });

  it('tạo cờ không có lý do thì reason null', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    expect(flag.reason).toBeNull();
  });

  it('tạo cờ bởi Điều phối viên thì báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    await expect(
      services.flags.create({ orderId: order.id }, COORDINATOR),
    ).rejects.toThrow('Tạo cờ hạn chế cần vai Nhân viên chăm sóc khách hàng');
    expect(await actionCount(services.audit, 'restricted-flag.created')).toBe(
      0,
    );
  });

  it('tạo cờ cho đơn không có thì 404, không ghi audit', async () => {
    const services = await buildServices();
    await expect(
      services.flags.create({ orderId: 'DH-9999' }, CSKH),
    ).rejects.toThrow('Không tìm thấy đơn DH-9999');
    expect(await actionCount(services.audit, 'restricted-flag.created')).toBe(
      0,
    );
  });

  it('đơn đã có cờ đang xử lý thì tạo thêm báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    await services.flags.create({ orderId: order.id }, CSKH);
    await expect(
      services.flags.create({ orderId: order.id }, CSKH),
    ).rejects.toThrow('đã có cờ hạn chế đang xử lý');
    expect(await actionCount(services.audit, 'restricted-flag.created')).toBe(
      1,
    );
  });

  it('cờ đã kiểm tra rồi thì đơn được tạo cờ mới', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const first = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.release(first.id, CSKH);
    const second = await services.flags.create({ orderId: order.id }, CSKH);
    expect(second.id).toBe('HG-1002');
    expect(second.status).toBe('Hoàn nhiều lần');
  });

  it('cờ ở trạng thái Hạn chế vẫn chặn tạo cờ mới cho đơn đó', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    await services.flags.approveRestrict(flag.id, MANAGER);
    await expect(
      services.flags.create({ orderId: order.id }, CSKH),
    ).rejects.toThrow('đã có cờ hạn chế đang xử lý');
  });

  it('release: CSKH cho đi đơn từ Hoàn nhiều lần sang Đã kiểm tra, ghi người quyết định', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    const released = await services.flags.release(flag.id, CSKH);
    expect(released.status).toBe('Đã kiểm tra');
    expect(released.decidedBy).toBe('lan');
    expect(released.decidedAt).not.toBeNull();
    expect(
      await actionCount(services.audit, 'restricted-flag.released'),
    ).toBe(1);
  });

  it('release: Quản lý thì báo 409 và ghi audit từ chối', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await expect(services.flags.release(flag.id, MANAGER)).rejects.toThrow(
      'Cho đi đơn cần vai Nhân viên chăm sóc khách hàng',
    );
    expect(await deniedCount(services.audit)).toBe(1);
    expect((await services.flags.get(flag.id)).status).toBe('Hoàn nhiều lần');
  });

  it('release: cờ đã kiểm tra rồi thì báo 409', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.release(flag.id, CSKH);
    await expect(services.flags.release(flag.id, CSKH)).rejects.toThrow(
      'đang ở trạng thái "Đã kiểm tra"',
    );
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('propose-restrict: thiếu lý do thì báo 400', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await expect(
      services.flags.proposeRestrict(flag.id, { reason: '  ' }, CSKH),
    ).rejects.toThrow('Đề xuất hạn chế cần có lý do');
    expect((await services.flags.get(flag.id)).status).toBe('Hoàn nhiều lần');
  });

  it('propose-restrict: CSKH đề xuất từ Hoàn nhiều lần sang Chờ duyệt thêm, chưa ghi người quyết định', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    const proposed = await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn 3 lần trong tháng' },
      CSKH,
    );
    expect(proposed.status).toBe('Chờ duyệt thêm');
    expect(proposed.reason).toBe('Hoàn 3 lần trong tháng');
    expect(proposed.decidedBy).toBeNull();
    expect(proposed.decidedAt).toBeNull();
    expect(
      await actionCount(services.audit, 'restricted-flag.restrict-proposed'),
    ).toBe(1);
  });

  it('propose-restrict: cờ đang Chờ duyệt thêm thì báo 409', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    await expect(
      services.flags.proposeRestrict(
        flag.id,
        { reason: 'Hoàn quá nhiều' },
        CSKH,
      ),
    ).rejects.toThrow('đang ở trạng thái "Chờ duyệt thêm"');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('approve-restrict: Quản lý duyệt từ Chờ duyệt thêm sang Hạn chế', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    const approved = await services.flags.approveRestrict(flag.id, MANAGER);
    expect(approved.status).toBe('Hạn chế');
    expect(approved.decidedBy).toBe('quan-ly');
    expect(approved.decidedAt).not.toBeNull();
    expect(
      await actionCount(services.audit, 'restricted-flag.restrict-approved'),
    ).toBe(1);
  });

  it('approve-restrict: Quản trị viên cũng duyệt được', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    const approved = await services.flags.approveRestrict(flag.id, ADMIN);
    expect(approved.status).toBe('Hạn chế');
    expect(approved.decidedBy).toBe('admin');
  });

  it('approve-restrict: CSKH thì báo 409 và ghi audit từ chối', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    await expect(services.flags.approveRestrict(flag.id, CSKH)).rejects.toThrow(
      'Duyệt hạn chế cần vai Quản lý hoặc Quản trị viên',
    );
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('approve-restrict: cờ chưa đề xuất (đang Hoàn nhiều lần) thì báo 409', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await expect(services.flags.approveRestrict(flag.id, MANAGER)).rejects.toThrow(
      'đang ở trạng thái "Hoàn nhiều lần"',
    );
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('reject-restrict: Quản trị viên từ chối từ Chờ duyệt thêm sang Đã kiểm tra', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    const rejected = await services.flags.rejectRestrict(
      flag.id,
      { reason: 'Khách đã xác nhận lỗi do kho' },
      ADMIN,
    );
    expect(rejected.status).toBe('Đã kiểm tra');
    expect(rejected.reason).toBe('Khách đã xác nhận lỗi do kho');
    expect(rejected.decidedBy).toBe('admin');
    expect(
      await actionCount(services.audit, 'restricted-flag.restrict-rejected'),
    ).toBe(1);
  });

  it('reject-restrict: thiếu lý do thì báo 400', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    await expect(
      services.flags.rejectRestrict(flag.id, { reason: '' }, MANAGER),
    ).rejects.toThrow('Từ chối hạn chế cần có lý do');
    expect((await services.flags.get(flag.id)).status).toBe('Chờ duyệt thêm');
  });

  it('cancel: CSKH hủy cờ từ Hoàn nhiều lần sang Đã hủy, đơn giữ nguyên trạng thái', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    const cancelled = await services.flags.cancel(
      flag.id,
      { reason: 'Khách nhầm đơn, không cần rà soát' },
      CSKH,
    );
    expect(cancelled.status).toBe('Đã hủy');
    expect(cancelled.reason).toBe('Khách nhầm đơn, không cần rà soát');
    expect(cancelled.decidedBy).toBe('lan');
    expect(
      await actionCount(services.audit, 'restricted-flag.cancelled'),
    ).toBe(1);
    // Chỉ ghi quyết định trên cờ, đơn không bị hủy theo: đơn vẫn Đã giao.
    expect((await services.orders.findOne(order.id)).state).toBe('Đã giao');
  });

  it('cancel: Quản lý hủy cờ đang Chờ duyệt thêm cũng được', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.proposeRestrict(
      flag.id,
      { reason: 'Hoàn quá nhiều' },
      CSKH,
    );
    const cancelled = await services.flags.cancel(
      flag.id,
      { reason: 'Khách đã giải trình' },
      MANAGER,
    );
    expect(cancelled.status).toBe('Đã hủy');
  });

  it('cancel: Nhân viên kho thì báo 409 và ghi audit từ chối', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await expect(
      services.flags.cancel(flag.id, { reason: 'Không cần rà soát' }, WAREHOUSE),
    ).rejects.toThrow('Hủy đơn cần vai');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('cancel: thiếu lý do thì báo 400', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await expect(
      services.flags.cancel(flag.id, { reason: '  ' }, CSKH),
    ).rejects.toThrow('Hủy đơn ở danh sách hạn chế cần có lý do');
    expect((await services.flags.get(flag.id)).status).toBe('Hoàn nhiều lần');
  });

  it('cancel: cờ đã hủy rồi thì báo 409', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    await services.flags.cancel(flag.id, { reason: 'Không cần rà soát' }, CSKH);
    await expect(
      services.flags.cancel(flag.id, { reason: 'Không cần rà soát' }, CSKH),
    ).rejects.toThrow('đang ở trạng thái "Đã hủy"');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('get: cờ không có thì 404', async () => {
    const services = await buildServices();
    await expect(services.flags.get('HG-9999')).rejects.toThrow(
      'Không tìm thấy cờ hạn chế HG-9999',
    );
  });

  it('list: lọc theo status, source, orderId và customerId', async () => {
    const services = await buildServices();
    const orderA = await createDeliveredOrder(services, 'key-1', PHONE_A);
    const orderB = await createDeliveredOrder(services, 'key-2', PHONE_B);
    const flagA = await services.flags.create({ orderId: orderA.id }, CSKH);
    const flagB = await services.flags.create({ orderId: orderB.id }, CSKH);
    await services.flags.release(flagB.id, CSKH);
    expect((await services.flags.list()).map((flag) => flag.id)).toEqual([
      flagA.id,
      flagB.id,
    ]);
    expect(
      (await services.flags.list({ status: 'Hoàn nhiều lần' })).map(
        (flag) => flag.id,
      ),
    ).toEqual([flagA.id]);
    expect(
      (await services.flags.list({ status: 'Đã kiểm tra' })).map(
        (flag) => flag.id,
      ),
    ).toEqual([flagB.id]);
    expect(
      (await services.flags.list({ source: 'CSKH' })).map((flag) => flag.id),
    ).toEqual([flagA.id, flagB.id]);
    expect(
      (await services.flags.list({ source: 'Hệ thống' })).map(
        (flag) => flag.id,
      ),
    ).toEqual([]);
    expect(
      (await services.flags.list({ orderId: orderA.id })).map(
        (flag) => flag.id,
      ),
    ).toEqual([flagA.id]);
    expect(
      (await services.flags.list({ customerId: 'KH-1001' })).map(
        (flag) => flag.id,
      ),
    ).toEqual([]);
  });

  it('get: kèm đơn đầy đủ và tỷ lệ hoàn tính từ đơn và trả hàng theo SĐT', async () => {
    const services = await buildServices();
    // Khách A có 4 đơn: 2 đơn trong 30 ngày (1 đã trả), 1 đơn 45 ngày trước
    // (đã trả), 1 đơn 100 ngày trước (đã trả, ngoài cửa sổ 90 ngày).
    const orderA = await createDeliveredOrder(services, 'key-1', PHONE_A);
    await createReturn(services, orderA.id);
    await createDeliveredOrder(services, 'key-2', PHONE_A);
    const orderC = await createDeliveredOrder(services, 'key-3', PHONE_A);
    const returnC = await createReturn(services, orderC.id);
    await backdateOrder(services, orderC.id, 45);
    await backdateReturn(services, returnC.id, 45);
    const orderD = await createDeliveredOrder(services, 'key-4', PHONE_A);
    const returnD = await createReturn(services, orderD.id);
    await backdateOrder(services, orderD.id, 100);
    await backdateReturn(services, returnD.id, 100);
    const flag = await services.flags.create({ orderId: orderA.id }, CSKH);
    const detail = await services.flags.get(flag.id);
    expect(detail.order.id).toBe(orderA.id);
    expect(detail.order.phone).toBe(PHONE_A);
    // 30 ngày: 2 đơn, 1 trả -> 50%. 90 ngày: 3 đơn, 2 trả -> 67%.
    expect(detail.stats).toEqual({ return1m: 50, return3m: 67, orders3m: 3 });
  });

  it('stats bằng 0 khi khách chưa trả đơn nào', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1', PHONE_B);
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    const detail = await services.flags.get(flag.id);
    expect(detail.stats).toEqual({ return1m: 0, return3m: 0, orders3m: 1 });
  });

  it('stats toàn 0 khi đơn không có SĐT', async () => {
    const services = await buildServices();
    const order = await createDeliveredOrder(services, 'key-1');
    expect(order.phone).toBeNull();
    const flag = await services.flags.create({ orderId: order.id }, CSKH);
    expect(flag.customerPhone).toBeNull();
    const detail = await services.flags.get(flag.id);
    expect(detail.stats).toEqual({ return1m: 0, return3m: 0, orders3m: 0 });
  });
});
