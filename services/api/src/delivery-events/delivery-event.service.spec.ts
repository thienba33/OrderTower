// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { DriversService } from '../drivers/driver.service';
import { InMemoryDriverStore } from '../drivers/driver.store';
import type { DriverStore } from '../drivers/driver.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ShipmentGateAdapter } from '../shipments/shipment-gate.adapter';
import { ShipmentsService } from '../shipments/shipment.service';
import { InMemoryShipmentStore } from '../shipments/shipment.store';
import type { ShipmentStore } from '../shipments/shipment.types';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { DeliveryEventsService } from './delivery-event.service';
import { InMemoryDeliveryEventStore } from './delivery-event.store';
import type { DeliveryEventStore } from './delivery-event.types';

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  shipments: ShipmentsService;
  shipmentStore: ShipmentStore;
  driverStore: DriverStore;
  vehicles: VehiclesService;
  drivers: DriversService;
  events: DeliveryEventsService;
  eventStore: DeliveryEventStore;
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
  // Xe và tài xế dùng chung cho ShipmentsService: dispatch chỉ nhận
  // xe thật và tài xế thật nên kiểm thử điều xe phải tạo xe và tài xế
  // trước, giống chạy thật qua mô-đun.
  const vehicles = new VehiclesService(audit, new InMemoryVehicleStore());
  await vehicles.onModuleInit();
  const driverStore = new InMemoryDriverStore();
  const drivers = new DriversService(audit, driverStore, vehicles);
  await drivers.onModuleInit();
  // Kho sự kiện, kho shipment và kho tài xế dùng chung cho cả
  // DeliveryEventsService và ShipmentsService, để sự kiện tự động theo
  // chuyển shipment và sự kiện ghi bằng tay thấy cùng 1 dữ liệu.
  const eventStore = new InMemoryDeliveryEventStore();
  const events = new DeliveryEventsService(
    audit,
    eventStore,
    shipmentStore,
    driverStore,
  );
  await events.onModuleInit();
  const shipments = new ShipmentsService(
    orders,
    audit,
    workflow,
    shipmentStore,
    vehicles,
    drivers,
    events,
  );
  return {
    orders,
    audit,
    shipments,
    shipmentStore,
    driverStore,
    vehicles,
    drivers,
    events,
    eventStore,
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
const DRIVER_2: Caller = {
  userId: 'user-tuan',
  username: 'tuan',
  roles: ['Tài xế'],
};
const MANAGER: Caller = {
  userId: 'user-quanly',
  username: 'quan-ly',
  roles: ['Quản lý'],
};

const ORDER_ADDRESS = {
  province: 'Hà Nội',
  ward: 'Phường Hai Bà Trưng',
  street: 'Số 8 phố Hàng Bè',
};

// Tạo đơn rồi đi tới "Chờ điều xe": tạo -> kiểm tra -> chờ kho -> đóng gói
// -> chờ điều xe. Địa chỉ đủ tin cậy, kho NM-40 còn hàng nên đi được.
async function createOrderReady(orders: OrdersService, key: string) {
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

async function createShipmentReady(
  services: Awaited<ReturnType<typeof buildServices>>,
  key = 'key-1',
) {
  const order = await createOrderReady(services.orders, key);
  const shipment = await services.shipments.create(
    { orderId: order.id },
    COORDINATOR,
  );
  return { order, shipment };
}

// Tạo 1 xe sẵn sàng để điều: mỗi test có services mới nên biển số mặc
// định dùng lại được; test nào cần xe thứ hai thì truyền biển số khác.
async function createVehicleReady(
  services: Awaited<ReturnType<typeof buildServices>>,
  plate = '29A-12345',
) {
  return services.vehicles.create({ plate, type: 'Xe máy' }, COORDINATOR);
}

// Tạo 1 tài xế sẵn sàng để điều: username mặc định là 'nam', khớp
// username của caller DRIVER dùng trong test, để kiểm tra quyền sở hữu ở
// ghi sự kiện thấy đúng người gọi. Mỗi test có services mới nên phone
// mặc định dùng lại được; tài xế thứ hai truyền tên, username và phone
// khác.
async function createDriverReady(
  services: Awaited<ReturnType<typeof buildServices>>,
  options: { name?: string; username?: string; phone?: string } = {},
) {
  const { name = 'Nam', username = 'nam', phone = '0901234567' } = options;
  return services.drivers.create({ name, phone, username }, COORDINATOR);
}

// Tạo shipment đang giao: đơn tới Chờ điều xe, tạo shipment, tạo xe và
// tài xế thật rồi điều xe. Điều xe ghi sẵn sự kiện tự động "Nhận đơn"
// (SK-1001) nên sự kiện ghi bằng tay đầu tiên trong test là SK-1002.
async function createShipmentDelivering(
  services: Awaited<ReturnType<typeof buildServices>>,
) {
  const { order, shipment } = await createShipmentReady(services);
  const vehicle = await createVehicleReady(services);
  const driver = await createDriverReady(services);
  const dispatched = await services.shipments.dispatch(
    shipment.id,
    { driverId: driver.id, vehicleId: vehicle.id },
    COORDINATOR,
  );
  return { order, shipment: dispatched, vehicle, driver };
}

async function deniedCount(audit: AuditService): Promise<number> {
  const records = await audit.getAll();
  return records.filter(
    (record) => record.action === 'delivery-event.create.denied',
  ).length;
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

describe('DeliveryEventsService', () => {
  it('ghi sự kiện Lấy hàng bằng tay, ghi audit delivery-event.created', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentDelivering(services);
    const event = await services.events.create(
      { shipmentId: shipment.id, type: 'Lấy hàng' },
      DRIVER,
    );
    expect(event.id).toBe('SK-1002');
    expect(event.shipmentId).toBe(shipment.id);
    expect(event.orderId).toBe(order.id);
    expect(event.type).toBe('Lấy hàng');
    expect(event.note).toBeNull();
    expect(event.proofPhotoKey).toBeNull();
    expect(event.by).toBe('nam');
    expect(event.role).toBe('Tài xế');
    expect(await actionCount(services.audit, 'delivery-event.created')).toBe(
      1,
    );
    const listed = await services.events.list({
      shipmentId: shipment.id,
    });
    expect(listed).toHaveLength(2);
    expect(listed.map((item) => item.type)).toEqual([
      'Nhận đơn',
      'Lấy hàng',
    ]);
  });

  it('ghi sự kiện Đang giao bằng tay kèm note và bằng chứng đã cắt khoảng trắng', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentDelivering(services);
    const event = await services.events.create(
      {
        shipmentId: shipment.id,
        type: 'Đang giao',
        note: '  Đang trên đường giao  ',
        proofPhotoKey: '  chung-tu/DH-1001/anh-di-duong.jpg  ',
      },
      DRIVER,
    );
    expect(event.id).toBe('SK-1002');
    expect(event.type).toBe('Đang giao');
    expect(event.note).toBe('Đang trên đường giao');
    expect(event.proofPhotoKey).toBe('chung-tu/DH-1001/anh-di-duong.jpg');
  });

  it('ghi sự kiện Ghi chú bằng tay, note bắt buộc', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentDelivering(services);
    const event = await services.events.create(
      {
        shipmentId: shipment.id,
        type: 'Ghi chú',
        note: 'Khách hẹn giao sau 14:00',
      },
      DRIVER,
    );
    expect(event.id).toBe('SK-1002');
    expect(event.type).toBe('Ghi chú');
    expect(event.note).toBe('Khách hẹn giao sau 14:00');
    expect(await actionCount(services.audit, 'delivery-event.created')).toBe(
      1,
    );
  });

  it('từ chối tạo bằng tay các loại chỉ ghi tự động và type ngoài tập kín', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentDelivering(services);
    for (const type of ['Nhận đơn', 'Đã giao', 'Giao thất bại'] as const) {
      await expect(
        services.events.create({ shipmentId: shipment.id, type }, DRIVER),
      ).rejects.toThrow('chỉ ghi tự động theo chuyển shipment');
    }
    await expect(
      services.events.create(
        { shipmentId: shipment.id, type: 'Không có' as never },
        DRIVER,
      ),
    ).rejects.toThrow(
      'Tạo sự kiện cần có type là "Lấy hàng", "Đang giao" hoặc "Ghi chú"',
    );
    expect(await deniedCount(services.audit)).toBe(0);
  });

  it('từ chối Ghi chú khi không có note', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentDelivering(services);
    await expect(
      services.events.create(
        { shipmentId: shipment.id, type: 'Ghi chú' },
        DRIVER,
      ),
    ).rejects.toThrow('Sự kiện "Ghi chú" cần có note');
    await expect(
      services.events.create(
        { shipmentId: shipment.id, type: 'Ghi chú', note: '   ' },
        DRIVER,
      ),
    ).rejects.toThrow('Sự kiện "Ghi chú" cần có note');
    expect(await deniedCount(services.audit)).toBe(0);
  });

  it('từ chối ghi sự kiện khi shipment không tồn tại, không ghi audit denied', async () => {
    const services = await buildServices();
    await expect(
      services.events.create(
        { shipmentId: 'GH-9999', type: 'Lấy hàng' },
        DRIVER,
      ),
    ).rejects.toThrow('Không tìm thấy shipment GH-9999');
    expect(await deniedCount(services.audit)).toBe(0);
  });

  it('từ chối ghi sự kiện khi shipment chưa giao, kiểm trạng thái trước vai', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    // Người gọi là Quản lý (sai cả trạng thái lẫn vai): lỗi báo phải là
    // lỗi trạng thái, vì kiểm trạng thái trước kiểm vai.
    await expect(
      services.events.create(
        { shipmentId: shipment.id, type: 'Lấy hàng' },
        MANAGER,
      ),
    ).rejects.toThrow('chỉ ghi sự kiện khi shipment đang giao');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('từ chối ghi sự kiện khi vai không phải tài xế hay điều phối viên', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentDelivering(services);
    await expect(
      services.events.create(
        { shipmentId: shipment.id, type: 'Lấy hàng' },
        MANAGER,
      ),
    ).rejects.toThrow('cần vai Tài xế hoặc Điều phối viên');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('từ chối tài xế khác ghi sự kiện, điều phối viên ghi được, tài xế được giao ghi được', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentDelivering(services);
    await expect(
      services.events.create(
        { shipmentId: shipment.id, type: 'Lấy hàng' },
        DRIVER_2,
      ),
    ).rejects.toThrow('Tài xế của shipment');
    expect(await deniedCount(services.audit)).toBe(1);
    const byCoordinator = await services.events.create(
      { shipmentId: shipment.id, type: 'Lấy hàng' },
      COORDINATOR,
    );
    expect(byCoordinator.by).toBe('son');
    expect(byCoordinator.role).toBe('Điều phối viên');
    const byDriver = await services.events.create(
      { shipmentId: shipment.id, type: 'Đang giao' },
      DRIVER,
    );
    expect(byDriver.by).toBe('nam');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('recordAuto ghi sự kiện mà không ghi audit', async () => {
    const services = await buildServices();
    const event = await services.events.recordAuto({
      shipmentId: 'GH-1001',
      orderId: 'DH-1001',
      type: 'Nhận đơn',
      by: 'son',
      role: 'Điều phối viên',
    });
    expect(event.id).toBe('SK-1001');
    expect(event.shipmentId).toBe('GH-1001');
    expect(event.orderId).toBe('DH-1001');
    expect(event.type).toBe('Nhận đơn');
    expect(event.by).toBe('son');
    expect(event.role).toBe('Điều phối viên');
    expect(await services.audit.getAll()).toHaveLength(0);
  });

  it('điều xe ghi sự kiện tự động Nhận đơn, không ghi audit riêng', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    const listed = await services.events.list({ shipmentId: shipment.id });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 'SK-1001',
      type: 'Nhận đơn',
      orderId: order.id,
      by: 'son',
      role: 'Điều phối viên',
    });
    expect(await actionCount(services.audit, 'delivery-event.created')).toBe(
      0,
    );
    expect(await actionCount(services.audit, 'shipment.dispatched')).toBe(1);
  });

  it('list lọc theo shipmentId, orderId và type; get báo 404 khi không có', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentDelivering(services);
    await services.events.create(
      { shipmentId: shipment.id, type: 'Lấy hàng' },
      DRIVER,
    );
    await services.events.create(
      { shipmentId: shipment.id, type: 'Đang giao' },
      DRIVER,
    );
    expect(
      (await services.events.list({ shipmentId: shipment.id })).map(
        (item) => item.type,
      ),
    ).toEqual(['Nhận đơn', 'Lấy hàng', 'Đang giao']);
    expect(
      (await services.events.list({ orderId: order.id })).map(
        (item) => item.type,
      ),
    ).toEqual(['Nhận đơn', 'Lấy hàng', 'Đang giao']);
    expect(
      (await services.events.list({ type: 'Lấy hàng' })).map(
        (item) => item.id,
      ),
    ).toEqual(['SK-1002']);
    expect(
      (await services.events.list({ shipmentId: 'GH-9999' })).map(
        (item) => item.id,
      ),
    ).toEqual([]);
    expect((await services.events.get('SK-1002')).type).toBe('Lấy hàng');
    await expect(services.events.get('SK-9999')).rejects.toThrow(
      'Không tìm thấy sự kiện giao hàng SK-9999',
    );
  });
});
