// SPDX-License-Identifier: Apache-2.0
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { BiService } from '../bi/bi.service';
import { ChannelsService } from '../channels/channel.service';
import { CustomersService } from '../customers/customer.service';
import { DeliveryEventsService } from '../delivery-events/delivery-event.service';
import { DriversService } from '../drivers/driver.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ReturnsService } from '../returns/return.service';
import { ShipmentsService } from '../shipments/shipment.service';
import { VehiclesService } from '../vehicles/vehicle.service';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { DbService } from './db.service';
import { createTestDbService } from './test-helpers';

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
const DRIVER_3: Caller = {
  userId: 'user-hung',
  username: 'hung',
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

// Kiểm thử lưu bền toàn app: khởi động AppModule thật trên Postgres ảo
// (pg-mem), đi 1 đơn tròn 9 trạng thái, rồi "khởi động lại" API bằng app
// mới trên cùng DB và kiểm tra mọi dữ liệu còn nguyên, số đơn tiếp tục tăng.
// AuthService chỉ lấy cấu hình lúc xác thực token nên app.init() không cần
// Keycloak; test gọi trực tiếp service với caller giả, không qua HTTP.
// app.init() còn nạp seed lịch sử mốc 3 (112 đơn LS-1001..LS-1112, 78
// shipment GH-1001..GH-1078, 13 trả hàng TH-1001..TH-1013, 151 sự kiện
// giao hàng tự động SK-1001..SK-1151) nên mã tạo tay trong test nối tiếp
// từ đó: shipment GH-1079, trả hàng TH-1014, sự kiện SK-1152. Đơn tạo
// tay vẫn nối DH-1009 vì đơn lịch sử dùng mã LS- riêng.
describe('Postgres persistence (toàn app trên pg-mem)', () => {
  it('đơn đi tròn 9 trạng thái tới Hoàn, khởi động lại vẫn còn đủ dữ liệu', async () => {
    const db = await createTestDbService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const orders = app.get(OrdersService);
    const audit = app.get(AuditService);
    const inventory = app.get(InventoryService);
    const instances = app.get(WorkflowInstanceService);
    const shipments = app.get(ShipmentsService);
    const vehicles = app.get(VehiclesService);
    const events = app.get(DeliveryEventsService);
    const channels = app.get(ChannelsService);
    const customers = app.get(CustomersService);

    // 3 kênh mẫu nạp từ seed lúc khởi động: Chat, Web, Điện thoại.
    expect((await channels.list()).map((channel) => channel.id)).toEqual([
      'K-1001',
      'K-1002',
      'K-1003',
    ]);
    expect(
      (await channels.list()).map((channel) => channel.name),
    ).toEqual(['Chat', 'Web', 'Điện thoại']);

    // Khách hàng nhận đơn tạo qua API, không có dữ liệu mẫu nạp sẵn.
    const customer = await customers.create(
      {
        name: 'Hộ nước mắm A',
        phone: '0901234567',
        address: 'Số 8 phố Hàng Bè, Hai Bà Trưng, Hà Nội',
      },
      COORDINATOR,
    );
    expect(customer.id).toBe('KH-1001');

    const order = await orders.create(
      {
        idempotencyKey: 'key-1',
        customer: 'Hộ nước mắm A',
        phone: '0901234567',
        items: [{ sku: 'NM-40', quantity: 2 }],
        channelId: 'K-1001',
        customerId: 'KH-1001',
        address: {
          province: 'Hà Nội',
          ward: 'Phường Hai Bà Trưng',
          street: 'Số 8 phố Hàng Bè',
        },
        deadline: '2026-11-20T10:00:00.000Z',
      },
      COORDINATOR,
    );
    expect(order.id).toBe('DH-1009');
    expect(order.phone).toBe('0901234567');
    expect(order.deadline).toBe('2026-11-20T10:00:00.000Z');
    // NM-40 142000 x 2 = 284000.
    expect(order.total).toBe(284000);
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
      current = await orders.transition(
        current.id,
        { to: step.to },
        step.caller,
      );
    }
    // Hai chuyển qua vùng giao hàng đi qua shipment, đơn đi theo từng bước.
    // Dispatch cần xe thật và tài xế thật: tạo xe và tài xế trước, xe và
    // tài xế theo shipment mà đổi trạng thái.
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(vehicle.id).toBe('XE-1006');
    const drivers = app.get(DriversService);
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    expect(driver.id).toBe('TX-1006');
    const shipment = await shipments.create(
      { orderId: order.id },
      COORDINATOR,
    );
    expect(shipment.id).toBe('GH-1079');
    await shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId: vehicle.id },
      COORDINATOR,
    );
    current = await orders.findOne(order.id);
    expect(current.state).toBe('Đang giao');
    expect((await vehicles.get(vehicle.id)).status).toBe('Đang giao');
    expect((await drivers.get(driver.id)).status).toBe('Đang giao');
    // Điều xe ghi sự kiện tự động Nhận đơn; tài xế ghi thêm mốc Lấy hàng,
    // Đang giao và Ghi chú khi shipment đang giao.
    const afterDispatch = await events.list({ shipmentId: shipment.id });
    expect(afterDispatch).toHaveLength(1);
    expect(afterDispatch[0]).toMatchObject({
      id: 'SK-1152',
      type: 'Nhận đơn',
      orderId: order.id,
      by: 'son',
      role: 'Điều phối viên',
    });
    const pickup = await events.create(
      { shipmentId: shipment.id, type: 'Lấy hàng' },
      DRIVER,
    );
    expect(pickup.id).toBe('SK-1153');
    const enRoute = await events.create(
      {
        shipmentId: shipment.id,
        type: 'Đang giao',
        note: 'Đang trên đường giao',
      },
      DRIVER,
    );
    expect(enRoute.id).toBe('SK-1154');
    const note = await events.create(
      {
        shipmentId: shipment.id,
        type: 'Ghi chú',
        note: 'Khách hẹn giao sau 14:00',
      },
      DRIVER,
    );
    expect(note.id).toBe('SK-1155');
    await shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1009/anh-giao.jpg' },
      DRIVER,
    );
    current = await orders.findOne(order.id);
    expect(current.state).toBe('Đã giao');
    expect((await vehicles.get(vehicle.id)).status).toBe('Sẵn sàng');
    expect((await drivers.get(driver.id)).status).toBe('Sẵn sàng');
    // Giao hàng ghi sự kiện tự động Đã giao kèm bằng chứng.
    const afterDeliver = await events.list({ shipmentId: shipment.id });
    expect(afterDeliver).toHaveLength(5);
    expect(afterDeliver.map((event) => event.type)).toEqual([
      'Nhận đơn',
      'Lấy hàng',
      'Đang giao',
      'Ghi chú',
      'Đã giao',
    ]);
    expect(afterDeliver[4]).toMatchObject({
      id: 'SK-1156',
      proofPhotoKey: 'chung-tu/DH-1009/anh-giao.jpg',
    });
    current = await orders.transition(
      current.id,
      { to: 'Hoàn', handling: 'Đối soát xong, khách giữ hàng' },
      COORDINATOR,
    );
    expect(current.state).toBe('Hoàn');
    expect(current.history).toHaveLength(8);
    expect((await audit.verify()).valid).toBe(true);
    expect(await inventory.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
    expect(
      (await instances.findByBusinessKey('order-flow', 'DH-1009'))?.status,
    ).toBe('completed');

    // Mô phỏng khởi động lại API: app mới, cùng DB Postgres ảo.
    const secondRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const secondApp = secondRef.createNestApplication();
    await secondApp.init();
    const secondOrders = secondApp.get(OrdersService);
    const secondAudit = secondApp.get(AuditService);
    const secondInventory = secondApp.get(InventoryService);
    const secondVehicles = secondApp.get(VehiclesService);
    const secondDrivers = secondApp.get(DriversService);
    const secondShipments = secondApp.get(ShipmentsService);
    const secondEvents = secondApp.get(DeliveryEventsService);
    const secondChannels = secondApp.get(ChannelsService);
    const secondCustomers = secondApp.get(CustomersService);

    const reopened = await secondOrders.findOne('DH-1009');
    expect(reopened.state).toBe('Hoàn');
    expect(reopened.history).toHaveLength(8);
    // SĐT, mốc giao hẹn và tổng tiền vẫn còn sau khi khởi động lại.
    expect(reopened.phone).toBe('0901234567');
    expect(reopened.deadline).toBe('2026-11-20T10:00:00.000Z');
    expect(reopened.total).toBe(284000);
    // Kênh của đơn vẫn còn sau khi khởi động lại.
    expect(reopened.channelId).toBe('K-1001');
    // Khách hàng của đơn vẫn còn sau khi khởi động lại; khách tiếp theo
    // nối số thứ tự KH-1002.
    expect(reopened.customerId).toBe('KH-1001');
    expect(await secondCustomers.get('KH-1001')).toMatchObject({
      name: 'Hộ nước mắm A',
      phone: '0901234567',
    });
    const nextCustomer = await secondCustomers.create(
      { name: 'Hộ nước mắm B', phone: '0901234568' },
      COORDINATOR,
    );
    expect(nextCustomer.id).toBe('KH-1002');
    // 3 kênh mẫu vẫn còn sau khi khởi động lại, không nạp seed lại; kênh
    // tạo tay tiếp theo nối số thứ tự K-1004.
    expect(
      (await secondChannels.list()).map((channel) => channel.id),
    ).toEqual(['K-1001', 'K-1002', 'K-1003']);
    const nextChannel = await secondChannels.create(
      { name: 'Sàn thương mại' },
      COORDINATOR,
    );
    expect(nextChannel.id).toBe('K-1004');
    expect((await secondAudit.verify()).valid).toBe(true);
    expect(await secondInventory.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
    // Xe vẫn còn sau khi khởi động lại, ở trạng thái cuối luồng.
    expect((await secondVehicles.get('XE-1006')).status).toBe('Sẵn sàng');
    // Tài xế vẫn còn sau khi khởi động lại, ở trạng thái cuối luồng.
    expect((await secondDrivers.get('TX-1006')).status).toBe('Sẵn sàng');
    const nextDriver = await secondDrivers.create(
      { name: 'Tuấn', phone: '0901234568', username: 'tuan' },
      COORDINATOR,
    );
    expect(nextDriver.id).toBe('TX-1007');
    const nextVehicle = await secondVehicles.create(
      { plate: '29B-67890', type: 'Xe tải nhỏ' },
      COORDINATOR,
    );
    expect(nextVehicle.id).toBe('XE-1007');
    const next = await secondOrders.create(
      {
        idempotencyKey: 'key-2',
        customer: 'Hộ nước mắm B',
        items: [{ sku: 'NM-40', quantity: 1 }],
        address: {
          province: 'Hà Nội',
          ward: 'Phường Hai Bà Trưng',
          street: 'Số 8 phố Hàng Bè',
        },
      },
      COORDINATOR,
    );
    expect(next.id).toBe('DH-1010');
    // Đơn không ghi phone/deadline thì null, total tính từ items.
    expect(next.phone).toBeNull();
    expect(next.deadline).toBeNull();
    expect(next.total).toBe(142000);
    // Sự kiện giao hàng vẫn còn sau khi khởi động lại, đủ 5 mốc.
    const kept = await secondEvents.list({ shipmentId: 'GH-1079' });
    expect(kept).toHaveLength(5);
    expect(kept.map((event) => event.type)).toEqual([
      'Nhận đơn',
      'Lấy hàng',
      'Đang giao',
      'Ghi chú',
      'Đã giao',
    ]);
    // Đơn mới đi tới giao hàng: sự kiện tiếp theo tiếp tục số thứ tự
    // SK-1157.
    for (const step of steps) {
      await secondOrders.transition(next.id, { to: step.to }, step.caller);
    }
    const nextShipment = await secondShipments.create(
      { orderId: next.id },
      COORDINATOR,
    );
    expect(nextShipment.id).toBe('GH-1080');
    await secondShipments.dispatch(
      nextShipment.id,
      { driverId: nextDriver.id, vehicleId: nextVehicle.id },
      COORDINATOR,
    );
    const nextEvents = await secondEvents.list({
      shipmentId: nextShipment.id,
    });
    expect(nextEvents).toHaveLength(1);
    expect(nextEvents[0]).toMatchObject({
      id: 'SK-1157',
      type: 'Nhận đơn',
      orderId: 'DH-1010',
    });
    // Không gọi app.close(): 2 app dùng chung 1 pool pg-mem, đóng pool rồi
    // thì app còn lại không dùng được nữa; pg-mem không giữ socket thật nên
    // không cần đóng để Jest thoát.
  }, 60000);

  it('shipment đi tạo -> điều xe -> giao thất bại -> điều xe lại -> giao hàng, khởi động lại vẫn còn dữ liệu', async () => {
    const db = await createTestDbService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const orders = app.get(OrdersService);
    const shipments = app.get(ShipmentsService);
    const audit = app.get(AuditService);
    const vehicles = app.get(VehiclesService);
    const drivers = app.get(DriversService);
    const returns = app.get(ReturnsService);

    const order = await orders.create(
      {
        idempotencyKey: 'key-1',
        customer: 'Hộ nước mắm A',
        items: [{ sku: 'NM-40', quantity: 2 }],
        address: {
          province: 'Hà Nội',
          ward: 'Phường Hai Bà Trưng',
          street: 'Số 8 phố Hàng Bè',
        },
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
    const shipment = await shipments.create(
      { orderId: order.id },
      COORDINATOR,
    );
    expect(shipment.id).toBe('GH-1079');
    expect(shipment.status).toBe('Chờ điều xe');
    const firstVehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(firstVehicle.id).toBe('XE-1006');
    const firstDriver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    expect(firstDriver.id).toBe('TX-1006');
    const dispatched = await shipments.dispatch(
      shipment.id,
      { driverId: firstDriver.id, vehicleId: firstVehicle.id },
      COORDINATOR,
    );
    expect(dispatched.status).toBe('Đang giao');
    expect(dispatched.driverId).toBe(firstDriver.id);
    expect(dispatched.vehicleId).toBe(firstVehicle.id);
    expect((await orders.findOne(order.id)).state).toBe('Đang giao');
    expect((await vehicles.get(firstVehicle.id)).status).toBe('Đang giao');
    expect((await drivers.get(firstDriver.id)).status).toBe('Đang giao');
    // Giao thất bại thì đơn quay lại Chờ điều xe, điều xe lại chính
    // shipment này (không tạo shipment mới).
    const failed = await shipments.fail(
      shipment.id,
      { reason: 'Khách không nghe máy' },
      DRIVER,
    );
    expect(failed.status).toBe('Giao thất bại');
    expect((await orders.findOne(order.id)).state).toBe('Chờ điều xe');
    expect((await vehicles.get(firstVehicle.id)).status).toBe('Sẵn sàng');
    expect((await drivers.get(firstDriver.id)).status).toBe('Sẵn sàng');
    // Điều xe lại được phép đổi xe khác và đổi tài xế khác; giao hàng sau
    // đó do tài xế mới thực hiện.
    const secondVehicle = await vehicles.create(
      { plate: '29B-67890', type: 'Xe tải nhỏ' },
      COORDINATOR,
    );
    expect(secondVehicle.id).toBe('XE-1007');
    const secondDriver = await drivers.create(
      { name: 'Tuấn', phone: '0901234568', username: 'tuan' },
      COORDINATOR,
    );
    expect(secondDriver.id).toBe('TX-1007');
    const redispatched = await shipments.dispatch(
      shipment.id,
      { driverId: secondDriver.id, vehicleId: secondVehicle.id },
      COORDINATOR,
    );
    expect(redispatched.status).toBe('Đang giao');
    expect(redispatched.driverId).toBe(secondDriver.id);
    expect(redispatched.history).toHaveLength(4);
    expect((await orders.findOne(order.id)).state).toBe('Đang giao');
    expect((await vehicles.get(firstVehicle.id)).status).toBe('Sẵn sàng');
    expect((await vehicles.get(secondVehicle.id)).status).toBe('Đang giao');
    expect((await drivers.get(firstDriver.id)).status).toBe('Sẵn sàng');
    expect((await drivers.get(secondDriver.id)).status).toBe('Đang giao');
    const delivered = await shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1009/anh-giao.jpg' },
      DRIVER_2,
    );
    expect(delivered.status).toBe('Đã giao');
    expect(delivered.proofPhotoKey).toBe('chung-tu/DH-1009/anh-giao.jpg');
    expect(delivered.history).toHaveLength(5);
    expect((await orders.findOne(order.id)).state).toBe('Đã giao');
    expect((await vehicles.get(secondVehicle.id)).status).toBe('Sẵn sàng');
    expect((await drivers.get(secondDriver.id)).status).toBe('Sẵn sàng');
    // Đơn đã giao thì CSKH tạo trả hàng, quản lý duyệt, điều phối viên
    // hoàn tiền.
    const ret = await returns.create(
      { orderId: order.id, reason: 'Khách đổi ý, hàng còn nguyên' },
      CSKH,
    );
    expect(ret.id).toBe('TH-1014');
    expect(ret.status).toBe('Chờ xử lý');
    const approved = await returns.approve(ret.id, MANAGER);
    expect(approved.status).toBe('Đã duyệt');
    const refunded = await returns.refund(ret.id, COORDINATOR);
    expect(refunded.status).toBe('Đã hoàn tiền');
    // Đơn đã giao xong thì không tạo được shipment mới nữa.
    await expect(
      shipments.create({ orderId: order.id }, COORDINATOR),
    ).rejects.toThrow('chỉ tạo shipment khi đơn ở "Chờ điều xe"');
    expect((await audit.verify()).valid).toBe(true);

    // Mô phỏng khởi động lại API: app mới, cùng DB Postgres ảo.
    const secondRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const secondApp = secondRef.createNestApplication();
    await secondApp.init();
    const secondOrders = secondApp.get(OrdersService);
    const secondShipments = secondApp.get(ShipmentsService);
    const secondAudit = secondApp.get(AuditService);
    const secondVehicles = secondApp.get(VehiclesService);
    const secondDrivers = secondApp.get(DriversService);
    const secondReturns = secondApp.get(ReturnsService);

    const reopened = await secondShipments.get('GH-1079');
    expect(reopened.status).toBe('Đã giao');
    expect(reopened.history).toHaveLength(5);
    expect(reopened.proofPhotoKey).toBe('chung-tu/DH-1009/anh-giao.jpg');
    expect((await secondOrders.findOne('DH-1009')).state).toBe('Đã giao');
    expect((await secondAudit.verify()).valid).toBe(true);
    // Trả hàng vẫn còn sau khi khởi động lại, ở trạng thái cuối luồng.
    const keptReturn = await secondReturns.get('TH-1014');
    expect(keptReturn.status).toBe('Đã hoàn tiền');
    expect(keptReturn.orderId).toBe('DH-1009');
    // Cả 2 xe vẫn còn sau khi khởi động lại, đều về Sẵn sàng; xe tiếp
    // theo tiếp tục số thứ tự XE-1008.
    expect((await secondVehicles.get('XE-1006')).status).toBe('Sẵn sàng');
    expect((await secondVehicles.get('XE-1007')).status).toBe('Sẵn sàng');
    // Cả 2 tài xế vẫn còn sau khi khởi động lại, đều về Sẵn sàng; tài xế
    // tiếp theo tiếp tục số thứ tự TX-1008.
    expect((await secondDrivers.get('TX-1006')).status).toBe('Sẵn sàng');
    expect((await secondDrivers.get('TX-1007')).status).toBe('Sẵn sàng');
    const nextDriver = await secondDrivers.create(
      { name: 'Hùng', phone: '0901234569', username: 'hung' },
      COORDINATOR,
    );
    expect(nextDriver.id).toBe('TX-1008');
    const nextVehicle = await secondVehicles.create(
      { plate: '29C-11111', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(nextVehicle.id).toBe('XE-1008');
    const order2 = await secondOrders.create(
      {
        idempotencyKey: 'key-2',
        customer: 'Hộ nước mắm B',
        items: [{ sku: 'NM-40', quantity: 1 }],
        address: {
          province: 'Hà Nội',
          ward: 'Phường Hai Bà Trưng',
          street: 'Số 8 phố Hàng Bè',
        },
      },
      COORDINATOR,
    );
    for (const step of steps) {
      await secondOrders.transition(order2.id, { to: step.to }, step.caller);
    }
    const next = await secondShipments.create(
      { orderId: order2.id },
      COORDINATOR,
    );
    expect(next.id).toBe('GH-1080');
    // Đơn mới đi tới giao hàng rồi trả hàng: trả hàng tiếp theo tiếp tục
    // số thứ tự TH-1015.
    await secondShipments.dispatch(
      next.id,
      { driverId: nextDriver.id, vehicleId: nextVehicle.id },
      COORDINATOR,
    );
    await secondShipments.deliver(
      next.id,
      { proofPhotoKey: 'chung-tu/DH-1010/anh-giao.jpg' },
      DRIVER_3,
    );
    expect((await secondOrders.findOne(order2.id)).state).toBe('Đã giao');
    const nextReturn = await secondReturns.create(
      { orderId: order2.id, reason: 'Hàng lỗi, khách yêu cầu trả' },
      CSKH,
    );
    expect(nextReturn.id).toBe('TH-1015');
    expect(nextReturn.status).toBe('Chờ xử lý');
  }, 60000);

  it('BI pilot khởi động cùng app, tính đúng trên dữ liệu mẫu, quyết định đề xuất và snapshot còn sau khi khởi động lại', async () => {
    const db = await createTestDbService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const bi = app.get(BiService);

    // Dữ liệu mẫu mốc 3 đã nạp lúc khởi động: 40 SKU, 120 đơn, 13 đơn
    // hoàn, ngày tham chiếu 22/11/2026.
    const { referenceDate, rows } = await bi.forecast();
    expect(referenceDate).toBe('2026-11-22');
    expect(rows.filter((row) => row.channelId === null)).toHaveLength(40);
    const { anomalies } = await bi.anomalies();
    expect(anomalies).toHaveLength(9);
    const recs = await bi.listRecommendations();
    expect(recs).toHaveLength(9);
    expect(recs.every((rec) => rec.status === 'Chờ duyệt')).toBe(true);
    const score = await bi.dxScore();
    expect(score.p.score).toBe(15);
    expect(score.d.score).toBe(30);
    expect(score.i.score).toBe(0);
    expect(score.h.score).toBe(55);
    expect(score.total).toBe(100);

    // Quản lý duyệt 1 đề xuất: quyết định ghi bền qua kho Postgres.
    const decided = await bi.decideRecommendation(
      recs[0].id,
      { decision: 'approved' },
      MANAGER,
    );
    expect(decided.status).toBe('Đã duyệt');

    const secondRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const secondApp = secondRef.createNestApplication();
    await secondApp.init();
    const secondBi = secondApp.get(BiService);
    // Đề xuất đã duyệt và snapshot vẫn còn sau khi khởi động lại; gọi
    // anomalies lại không tạo đề xuất trùng (upsert theo anomalyKey).
    const kept = await secondBi.getRecommendation(recs[0].id);
    expect(kept.status).toBe('Đã duyệt');
    expect(kept.decidedBy).toBe('quan-ly');
    expect((await secondBi.listRecommendations())).toHaveLength(9);
    await secondBi.anomalies();
    expect((await secondBi.listRecommendations())).toHaveLength(9);
    const latest = await secondBi.latestDxScoreSnapshot();
    expect(latest?.total).toBe(100);
    // Tính lại sau khi có 1 đề xuất đã duyệt (chưa có phản hồi): trục I
    // giờ đo được, giá trị 0/1 = 0, mẫu nhỏ, tổng vẫn 100.
    const rescored = await secondBi.dxScore();
    expect(rescored.i.correctApproved.measured).toBe(true);
    expect(rescored.i.correctApproved.value).toBe(0);
    expect(rescored.i.correctApproved.n).toBe(1);
    expect(rescored.i.smallSample).toBe(true);
    expect(rescored.total).toBe(100);
  }, 60000);
});
