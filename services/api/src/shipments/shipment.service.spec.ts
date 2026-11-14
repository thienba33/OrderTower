// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { ShipmentGateAdapter } from './shipment-gate.adapter';
import { ShipmentsService } from './shipment.service';
import { InMemoryShipmentStore } from './shipment.store';
import type { ShipmentStore } from './shipment.types';
import { DriversService } from '../drivers/driver.service';
import { InMemoryDriverStore } from '../drivers/driver.store';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  shipments: ShipmentsService;
  shipmentStore: ShipmentStore;
  vehicles: VehiclesService;
  drivers: DriversService;
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
  return { orders, audit, shipments, shipmentStore, vehicles, drivers };
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
  district: 'Hai Bà Trưng',
  ward: 'Phường Phạm Đình Hổ',
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
  return services.vehicles.create(
    { plate, type: 'Xe máy' },
    COORDINATOR,
  );
}

// Tạo 1 tài xế sẵn sàng để điều: username mặc định là 'nam', khớp
// username của caller DRIVER dùng trong test, để kiểm tra quyền sở hữu ở
// giao hàng và giao thất bại thấy đúng người gọi. Mỗi test có services
// mới nên phone mặc định dùng lại được; tài xế thứ hai truyền tên,
// username và phone khác.
async function createDriverReady(
  services: Awaited<ReturnType<typeof buildServices>>,
  options: { name?: string; username?: string; phone?: string } = {},
) {
  const { name = 'Nam', username = 'nam', phone = '0901234567' } = options;
  return services.drivers.create({ name, phone, username }, COORDINATOR);
}

async function deniedCount(audit: AuditService): Promise<number> {
  const records = await audit.getAll();
  return records.filter(
    (record) => record.action === 'shipment.transition.denied',
  ).length;
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

describe('ShipmentsService', () => {
  it('tạo shipment ở trạng thái Chờ điều xe, ghi lịch sử và audit', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    expect(shipment.id).toBe('GH-1001');
    expect(shipment.orderId).toBe(order.id);
    expect(shipment.status).toBe('Chờ điều xe');
    expect(shipment.driverId).toBeNull();
    expect(shipment.vehicleId).toBeNull();
    expect(shipment.proofPhotoKey).toBeNull();
    expect(shipment.history).toHaveLength(1);
    expect(shipment.history[0]).toMatchObject({
      from: null,
      to: 'Chờ điều xe',
    });
    expect(await actionCount(services.audit, 'shipment.created')).toBe(1);
  });

  it('từ chối tạo khi đơn không tồn tại', async () => {
    const { shipments } = await buildServices();
    await expect(
      shipments.create({ orderId: 'DH-9999' }, COORDINATOR),
    ).rejects.toThrow('Không tìm thấy đơn DH-9999');
  });

  it('từ chối tạo khi đơn chưa ở Chờ điều xe', async () => {
    const { orders, shipments } = await buildServices();
    const order = await orders.create(
      {
        idempotencyKey: 'key-1',
        customer: 'Hộ nước mắm A',
        items: [{ sku: 'NM-40', quantity: 2 }],
        address: ORDER_ADDRESS,
      },
      COORDINATOR,
    );
    await expect(
      shipments.create({ orderId: order.id }, COORDINATOR),
    ).rejects.toThrow('chỉ tạo shipment khi đơn ở "Chờ điều xe"');
  });

  it('từ chối tạo khi đơn đã có shipment đang hoạt động', async () => {
    const services = await buildServices();
    const { order } = await createShipmentReady(services);
    await expect(
      services.shipments.create({ orderId: order.id }, COORDINATOR),
    ).rejects.toThrow('đã có shipment đang hoạt động');
  });

  it('từ chối tạo khi caller không phải Điều phối viên', async () => {
    const services = await buildServices();
    const order = await createOrderReady(services.orders, 'key-1');
    await expect(
      services.shipments.create({ orderId: order.id }, DRIVER),
    ).rejects.toThrow('cần vai Điều phối viên');
  });

  it('điều xe từ Chờ điều xe sang Đang giao, lưu tài xế và xe, đơn cũng sang Đang giao', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    const dispatched = await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    expect(dispatched.status).toBe('Đang giao');
    expect(dispatched.driverId).toBe(driver.id);
    expect(dispatched.vehicleId).toBe(vehicle.id);
    expect(dispatched.history).toHaveLength(2);
    expect(dispatched.history[1]).toMatchObject({
      from: 'Chờ điều xe',
      to: 'Đang giao',
    });
    expect(await actionCount(services.audit, 'shipment.dispatched')).toBe(1);
    expect((await services.orders.findOne(order.id)).state).toBe('Đang giao');
    expect((await services.vehicles.get(vehicle.id)).status).toBe('Đang giao');
    expect((await services.drivers.get(driver.id)).status).toBe('Đang giao');
  });

  it('điều xe thiếu driverId hoặc vehicleId thì báo 400', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: '', vehicleId: 'XE-1001' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Điều xe cần có driverId');
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: 'TX-01', vehicleId: '  ' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Điều xe cần có vehicleId');
    expect((await services.shipments.get(shipment.id)).status).toBe(
      'Chờ điều xe',
    );
  });

  it('điều xe với xe không tồn tại thì báo 404, shipment không đổi', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    const driver = await createDriverReady(services);
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: driver.id, vehicleId: 'XE-9999' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Không tìm thấy xe XE-9999');
    expect((await services.shipments.get(shipment.id)).status).toBe(
      'Chờ điều xe',
    );
    expect(await actionCount(services.audit, 'shipment.dispatched')).toBe(0);
  });

  it('điều xe với xe đang bận thì 409 và ghi audit denied, shipment không đổi', async () => {
    const services = await buildServices();
    const vehicle = await createVehicleReady(services);
    const firstDriver = await createDriverReady(services);
    const secondDriver = await createDriverReady(services, {
      name: 'Tuấn',
      username: 'tuan',
      phone: '0901234568',
    });
    const first = await createShipmentReady(services, 'key-1');
    await services.shipments.dispatch(
      first.shipment.id,
      { driverId: firstDriver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    expect((await services.vehicles.get(vehicle.id)).status).toBe('Đang giao');
    const second = await createShipmentReady(services, 'key-2');
    await expect(
      services.shipments.dispatch(
        second.shipment.id,
        { driverId: secondDriver.id, vehicleId: vehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow('đang ở trạng thái "Đang giao"');
    expect(await deniedCount(services.audit)).toBe(1);
    expect((await services.shipments.get(second.shipment.id)).status).toBe(
      'Chờ điều xe',
    );
    expect((await services.vehicles.get(vehicle.id)).status).toBe('Đang giao');
  });

  it('điều xe với xe đang bảo trì thì 409 và ghi audit denied', async () => {
    const services = await buildServices();
    const vehicle = await createVehicleReady(services);
    await services.vehicles.maintenance(vehicle.id, COORDINATOR);
    const { shipment } = await createShipmentReady(services);
    const driver = await createDriverReady(services);
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: driver.id, vehicleId: vehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow('đang ở trạng thái "Bảo trì"');
    expect(await deniedCount(services.audit)).toBe(1);
    expect((await services.shipments.get(shipment.id)).status).toBe(
      'Chờ điều xe',
    );
  });

  it('điều xe từ Đang giao thì 409 và ghi audit denied', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: driver.id, vehicleId: vehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow('không điều xe được');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('điều xe bởi Tài xế thì 409 và ghi audit denied', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: driver.id, vehicleId: vehicle.id },
        DRIVER,
      ),
    ).rejects.toThrow('cần vai Điều phối viên');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('điều xe khi đơn không ở Chờ điều xe thì shipment không đổi', async () => {
    const services = await buildServices();
    // Đơn mới tới Đang đóng gói, chưa tới Chờ điều xe; shipment ghi tay
    // vào kho để mô phỏng dữ liệu lệch (qua API công khai không tạo được
    // shipment cho đơn chưa tới Chờ điều xe).
    const order = await services.orders.create(
      {
        idempotencyKey: 'key-1',
        customer: 'Hộ nước mắm A',
        items: [{ sku: 'NM-40', quantity: 2 }],
        address: ORDER_ADDRESS,
      },
      COORDINATOR,
    );
    for (const step of [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
    ]) {
      await services.orders.transition(order.id, { to: step.to }, step.caller);
    }
    const now = new Date().toISOString();
    await services.shipmentStore.save({
      id: 'GH-9999',
      orderId: order.id,
      status: 'Chờ điều xe',
      driverId: null,
      vehicleId: null,
      proofPhotoKey: null,
      history: [
        {
          from: null,
          to: 'Chờ điều xe',
          by: 'son',
          role: 'Điều phối viên',
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    // Xe và tài xế có thật và sẵn sàng để lần điều xe chỉ thất bại ở
    // pre-check đơn, không thất bại ở kiểm tra xe hay tài xế.
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await expect(
      services.shipments.dispatch(
        'GH-9999',
        { driverId: driver.id, vehicleId: vehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow('không chuyển sang "Đang giao" được');
    expect((await services.shipments.get('GH-9999')).status).toBe(
      'Chờ điều xe',
    );
    expect(await actionCount(services.audit, 'shipment.dispatched')).toBe(0);
    expect((await services.orders.findOne(order.id)).state).toBe(
      'Đang đóng gói',
    );
  });

  it('giao thất bại rồi điều xe lại được, đơn đi theo từng bước', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const firstVehicle = await createVehicleReady(services);
    const secondVehicle = await createVehicleReady(services, '29B-67890');
    const firstDriver = await createDriverReady(services);
    const secondDriver = await createDriverReady(services, {
      name: 'Tuấn',
      username: 'tuan',
      phone: '0901234568',
    });
    await services.shipments.dispatch(
      shipment.id,
      { driverId: firstDriver.id, vehicleId: firstVehicle.id },
      COORDINATOR,
    );
    expect((await services.orders.findOne(order.id)).state).toBe('Đang giao');
    expect((await services.vehicles.get(firstVehicle.id)).status).toBe(
      'Đang giao',
    );
    expect((await services.drivers.get(firstDriver.id)).status).toBe(
      'Đang giao',
    );
    const failed = await services.shipments.fail(
      shipment.id,
      { reason: 'Khách không nghe máy' },
      DRIVER,
    );
    expect(failed.status).toBe('Giao thất bại');
    expect((await services.orders.findOne(order.id)).state).toBe(
      'Chờ điều xe',
    );
    // Giao thất bại trả xe và tài xế đầu về Sẵn sàng, điều xe lại được
    // phép đổi xe và đổi tài xế.
    expect((await services.vehicles.get(firstVehicle.id)).status).toBe(
      'Sẵn sàng',
    );
    expect((await services.drivers.get(firstDriver.id)).status).toBe(
      'Sẵn sàng',
    );
    const redispatched = await services.shipments.dispatch(
      shipment.id,
      { driverId: secondDriver.id, vehicleId: secondVehicle.id },
      COORDINATOR,
    );
    expect(redispatched.status).toBe('Đang giao');
    expect(redispatched.driverId).toBe(secondDriver.id);
    expect(redispatched.vehicleId).toBe(secondVehicle.id);
    expect(redispatched.history).toHaveLength(4);
    expect((await services.orders.findOne(order.id)).state).toBe('Đang giao');
    expect((await services.vehicles.get(firstVehicle.id)).status).toBe(
      'Sẵn sàng',
    );
    expect((await services.vehicles.get(secondVehicle.id)).status).toBe(
      'Đang giao',
    );
    expect((await services.drivers.get(firstDriver.id)).status).toBe(
      'Sẵn sàng',
    );
    expect((await services.drivers.get(secondDriver.id)).status).toBe(
      'Đang giao',
    );
  });

  it('giao hàng từ Đang giao sang Đã giao, lưu bằng chứng, đơn cũng sang Đã giao', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    const delivered = await services.shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
      DRIVER,
    );
    expect(delivered.status).toBe('Đã giao');
    expect(delivered.proofPhotoKey).toBe('chung-tu/DH-1001/anh-giao.jpg');
    expect(delivered.history).toHaveLength(3);
    expect(await actionCount(services.audit, 'shipment.delivered')).toBe(1);
    expect((await services.orders.findOne(order.id)).state).toBe('Đã giao');
    // Giao hàng xong trả xe về Sẵn sàng.
    expect((await services.vehicles.get(vehicle.id)).status).toBe('Sẵn sàng');
    // Giao hàng xong trả tài xế về Sẵn sàng.
    expect((await services.drivers.get(driver.id)).status).toBe('Sẵn sàng');
  });

  it('giao hàng xong thì không tạo được shipment mới cho đơn nữa', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
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
    expect((await services.orders.findOne(order.id)).state).toBe('Đã giao');
    await expect(
      services.shipments.create({ orderId: order.id }, COORDINATOR),
    ).rejects.toThrow('chỉ tạo shipment khi đơn ở "Chờ điều xe"');
  });

  it('giao hàng thiếu bằng chứng thì báo 400', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(
      services.shipments.deliver(shipment.id, { proofPhotoKey: '' }, DRIVER),
    ).rejects.toThrow('cần có proofPhotoKey');
  });

  it('giao hàng bởi Điều phối viên thì 409 và ghi audit denied', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(
      services.shipments.deliver(
        shipment.id,
        { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
        COORDINATOR,
      ),
    ).rejects.toThrow('cần vai Tài xế');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('giao hàng từ Chờ điều xe thì 409 và ghi audit denied', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    await expect(
      services.shipments.deliver(
        shipment.id,
        { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
        DRIVER,
      ),
    ).rejects.toThrow('không giao hàng được');
    expect(await deniedCount(services.audit)).toBe(1);
  });

  it('giao thất bại cần lý do, Tài xế và Điều phối viên đều được, đơn quay lại Chờ điều xe', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    const failed = await services.shipments.fail(
      shipment.id,
      { reason: 'Khách hẹn giao lại ngày mai' },
      DRIVER,
    );
    expect(failed.status).toBe('Giao thất bại');
    expect(failed.history[2]).toMatchObject({
      to: 'Giao thất bại',
      reason: 'Khách hẹn giao lại ngày mai',
    });
    // Tài xế báo cáo vẫn kéo đơn quay lại Chờ điều xe, ghi audit với tài
    // xế làm actor.
    expect((await services.orders.findOne(order.id)).state).toBe(
      'Chờ điều xe',
    );
    // Giao thất bại trả xe về Sẵn sàng.
    expect((await services.vehicles.get(vehicle.id)).status).toBe('Sẵn sàng');
    const failedAudit = (await services.audit.getAll()).filter(
      (record) => record.action === 'workflow.instance.transition',
    );
    expect(failedAudit.at(-1)).toMatchObject({
      actor: 'nam',
      from: 'Đang giao',
      to: 'Chờ điều xe',
    });
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    const failedAgain = await services.shipments.fail(
      shipment.id,
      { reason: 'Xe hỏng giữa đường' },
      COORDINATOR,
    );
    expect(failedAgain.status).toBe('Giao thất bại');
    expect(await actionCount(services.audit, 'shipment.failed')).toBe(2);
    expect((await services.orders.findOne(order.id)).state).toBe(
      'Chờ điều xe',
    );
  });

  it('giao thất bại thiếu lý do, sai trạng thái hoặc sai vai thì bị từ chối', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    await expect(
      services.shipments.fail(shipment.id, { reason: '  ' }, DRIVER),
    ).rejects.toThrow('cần có lý do');
    await expect(
      services.shipments.fail(
        shipment.id,
        { reason: 'Khách không nhận' },
        DRIVER,
      ),
    ).rejects.toThrow('không đánh dấu giao thất bại được');
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(
      services.shipments.fail(
        shipment.id,
        { reason: 'Khách không nhận' },
        MANAGER,
      ),
    ).rejects.toThrow('cần vai Tài xế hoặc Điều phối viên');
    expect(await deniedCount(services.audit)).toBe(2);
  });

  it('hủy shipment từ Chờ điều xe cần lý do, đơn không đổi', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const cancelled = await services.shipments.cancel(
      shipment.id,
      { reason: 'Khách hủy đơn' },
      COORDINATOR,
    );
    expect(cancelled.status).toBe('Đã hủy');
    expect(cancelled.history).toHaveLength(2);
    expect(cancelled.history[1]).toMatchObject({
      to: 'Đã hủy',
      reason: 'Khách hủy đơn',
    });
    expect(await actionCount(services.audit, 'shipment.cancelled')).toBe(1);
    expect((await services.orders.findOne(order.id)).state).toBe(
      'Chờ điều xe',
    );
  });

  it('hủy thiếu lý do, sai trạng thái hoặc sai vai thì bị từ chối', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    await expect(
      services.shipments.cancel(shipment.id, { reason: '' }, COORDINATOR),
    ).rejects.toThrow('Hủy shipment cần có lý do');
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(
      services.shipments.cancel(
        shipment.id,
        { reason: 'Khách hủy đơn' },
        COORDINATOR,
      ),
    ).rejects.toThrow('không hủy được');
    const { shipment: second } = await createShipmentReady(services, 'key-2');
    await expect(
      services.shipments.cancel(
        second.id,
        { reason: 'Khách hủy đơn' },
        DRIVER,
      ),
    ).rejects.toThrow('cần vai Điều phối viên');
    expect(await deniedCount(services.audit)).toBe(2);
  });

  it('hủy rồi tạo lại shipment mới được', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    await services.shipments.cancel(
      shipment.id,
      { reason: 'Khách hủy đơn' },
      COORDINATOR,
    );
    const again = await services.shipments.create(
      { orderId: order.id },
      COORDINATOR,
    );
    expect(again.id).toBe('GH-1002');
    expect(again.status).toBe('Chờ điều xe');
  });

  it('get không tìm thấy thì 404, list lọc theo đơn và trạng thái', async () => {
    const services = await buildServices();
    await expect(services.shipments.get('GH-9999')).rejects.toThrow(
      'Không tìm thấy shipment GH-9999',
    );
    const first = await createShipmentReady(services, 'key-1');
    const second = await createShipmentReady(services, 'key-2');
    expect(
      await services.shipments.list({ orderId: first.order.id }),
    ).toHaveLength(1);
    expect(
      await services.shipments.list({ status: 'Chờ điều xe' }),
    ).toHaveLength(2);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      first.shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    expect(
      await services.shipments.list({ status: 'Đang giao' }),
    ).toHaveLength(1);
    expect(await services.shipments.list()).toHaveLength(2);
    void second;
  });

  it('điều xe với tài xế không tồn tại thì báo 404, shipment không đổi', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: 'TX-9999', vehicleId: vehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow('Không tìm thấy tài xế TX-9999');
    expect((await services.shipments.get(shipment.id)).status).toBe(
      'Chờ điều xe',
    );
    expect(await actionCount(services.audit, 'shipment.dispatched')).toBe(0);
  });

  it('điều xe với tài xế đang bận thì 409 và ghi audit denied, shipment không đổi', async () => {
    const services = await buildServices();
    const driver = await createDriverReady(services);
    const vehicle = await createVehicleReady(services);
    const first = await createShipmentReady(services, 'key-1');
    await services.shipments.dispatch(
      first.shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    expect((await services.drivers.get(driver.id)).status).toBe('Đang giao');
    const second = await createShipmentReady(services, 'key-2');
    await expect(
      services.shipments.dispatch(
        second.shipment.id,
        { driverId: driver.id, vehicleId: vehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow('đang ở trạng thái "Đang giao"');
    expect(await deniedCount(services.audit)).toBe(1);
    expect((await services.shipments.get(second.shipment.id)).status).toBe(
      'Chờ điều xe',
    );
    expect((await services.drivers.get(driver.id)).status).toBe('Đang giao');
  });

  it('điều xe với tài xế đang tạm nghỉ thì 409 và ghi audit denied', async () => {
    const services = await buildServices();
    const driver = await createDriverReady(services);
    await services.drivers.rest(driver.id, COORDINATOR);
    const vehicle = await createVehicleReady(services);
    const { shipment } = await createShipmentReady(services);
    await expect(
      services.shipments.dispatch(
        shipment.id,
        { driverId: driver.id, vehicleId: vehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow('đang ở trạng thái "Tạm nghỉ"');
    expect(await deniedCount(services.audit)).toBe(1);
    expect((await services.shipments.get(shipment.id)).status).toBe(
      'Chờ điều xe',
    );
  });

  it('giao hàng bởi tài xế khác thì 409 và ghi audit denied, đơn không đổi', async () => {
    const services = await buildServices();
    const { order, shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(
      services.shipments.deliver(
        shipment.id,
        { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
        DRIVER_2,
      ),
    ).rejects.toThrow(
      `Tài xế của shipment ${shipment.id} là nam, không phải tuan`,
    );
    expect(await deniedCount(services.audit)).toBe(1);
    expect((await services.shipments.get(shipment.id)).status).toBe(
      'Đang giao',
    );
    expect((await services.orders.findOne(order.id)).state).toBe('Đang giao');
  });

  it('giao thất bại bởi tài xế khác thì 409 và ghi audit denied', async () => {
    const services = await buildServices();
    const { shipment } = await createShipmentReady(services);
    const vehicle = await createVehicleReady(services);
    const driver = await createDriverReady(services);
    await services.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(
      services.shipments.fail(
        shipment.id,
        { reason: 'Khách không nghe máy' },
        DRIVER_2,
      ),
    ).rejects.toThrow(
      `Tài xế của shipment ${shipment.id} là nam, không phải tuan`,
    );
    expect(await deniedCount(services.audit)).toBe(1);
    expect((await services.shipments.get(shipment.id)).status).toBe(
      'Đang giao',
    );
  });
});
