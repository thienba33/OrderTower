// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { ChannelsService } from '../channels/channel.service';
import { InMemoryChannelStore } from '../channels/channel.store';
import { CustomersService } from '../customers/customer.service';
import { InMemoryCustomerStore } from '../customers/customer.store';
import { DeliveryEventsService } from '../delivery-events/delivery-event.service';
import { InMemoryDeliveryEventStore } from '../delivery-events/delivery-event.store';
import type { DeliveryEventStore } from '../delivery-events/delivery-event.types';
import { DriversService } from '../drivers/driver.service';
import { InMemoryDriverStore } from '../drivers/driver.store';
import type { DriverStore } from '../drivers/driver.types';
import { InventoryService } from '../inventory/inventory.service';
import { InMemoryInventoryStore } from '../inventory/inventory.store';
import { OrdersService } from '../orders/orders.service';
import { ReturnGateAdapter } from '../returns/return-gate.adapter';
import { ReturnsService } from '../returns/return.service';
import { InMemoryReturnStore } from '../returns/return.store';
import type { ReturnStore } from '../returns/return.types';
import { ShipmentGateAdapter } from '../shipments/shipment-gate.adapter';
import { ShipmentsService } from '../shipments/shipment.service';
import { InMemoryShipmentStore } from '../shipments/shipment.store';
import type { ShipmentStore } from '../shipments/shipment.types';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { HistoricalSeedService } from './historical-seed.service';

// Dựng toàn bộ service trên bộ nhớ, giống khởi động thật: kho, kênh, xe,
// tài xế và 8 đơn demo đều nạp từ tệp seed thật; cổng shipment và cổng
// trả hàng dùng adapter thật trên cùng kho để chuyển đơn theo sự kiện
// shipment và đóng đơn bằng returnId chạy như chạy thật.
async function buildStack() {
  const workflow = new WorkflowService();
  workflow.onModuleInit();
  const audit = new AuditService();
  const inventory = new InventoryService(new InMemoryInventoryStore());
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
  const shipmentStore: ShipmentStore = new InMemoryShipmentStore();
  const returnStore: ReturnStore = new InMemoryReturnStore();
  const driverStore: DriverStore = new InMemoryDriverStore();
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
    approvals,
    undefined,
    new ShipmentGateAdapter(shipmentStore),
    channels,
    customers,
    new ReturnGateAdapter(returnStore),
  );
  await orders.onModuleInit();
  const vehicles = new VehiclesService(audit, new InMemoryVehicleStore());
  await vehicles.onModuleInit();
  const drivers = new DriversService(audit, driverStore, vehicles);
  await drivers.onModuleInit();
  const returns = new ReturnsService(orders, audit, returnStore);
  await returns.onModuleInit();
  const eventStore: DeliveryEventStore = new InMemoryDeliveryEventStore();
  const deliveryEvents = new DeliveryEventsService(
    audit,
    eventStore,
    shipmentStore,
    driverStore,
  );
  await deliveryEvents.onModuleInit();
  const shipments = new ShipmentsService(
    orders,
    audit,
    workflow,
    shipmentStore,
    vehicles,
    drivers,
    deliveryEvents,
  );
  await shipments.onModuleInit();
  const seed = new HistoricalSeedService(
    orders,
    shipments,
    returns,
    inventory,
  );
  return {
    orders,
    shipments,
    returns,
    inventory,
    audit,
    deliveryEvents,
    seed,
  };
}

const COORDINATOR: Caller = {
  userId: 'son',
  username: 'son',
  roles: ['Điều phối viên'],
};

describe('HistoricalSeedService', () => {
  it('nạp 112 đơn lịch sử qua đường dịch vụ thật, tổng 120 đơn', async () => {
    const { orders, shipments, returns, inventory, audit, seed } =
      await buildStack();
    await seed.onApplicationBootstrap();

    const all = await orders.list();
    expect(all).toHaveLength(120);
    const historical = all.filter((order) => order.id.startsWith('LS-'));
    expect(historical).toHaveLength(112);
    expect(historical[0].id).toBe('LS-1001');
    expect(historical[historical.length - 1].id).toBe('LS-1112');
    // 8 đơn demo còn nguyên, đơn tạo tay đầu tiên sau seed vẫn DH-1009.
    expect(
      all
        .filter((order) => order.id.startsWith('DH-'))
        .map((order) => order.id),
    ).toEqual([
      'DH-1001',
      'DH-1002',
      'DH-1003',
      'DH-1004',
      'DH-1005',
      'DH-1006',
      'DH-1007',
      'DH-1008',
    ]);
    const manual = await orders.create(
      {
        idempotencyKey: 'manual-sau-seed',
        customer: 'Hộ nước mắm A',
        items: [{ sku: 'NM-40', quantity: 1 }],
      },
      COORDINATOR,
    );
    expect(manual.id).toBe('DH-1009');

    // Phân bố 9 trạng thái đúng như tệp seed.
    const distribution = new Map<string, number>();
    for (const order of historical) {
      distribution.set(
        order.state,
        (distribution.get(order.state) ?? 0) + 1,
      );
    }
    expect(Object.fromEntries(distribution)).toEqual({
      Hoàn: 63,
      'Đã giao': 8,
      'Đang giao': 5,
      'Chờ điều xe': 8,
      'Đang đóng gói': 8,
      'Chờ kho': 8,
      'Đã kiểm tra': 5,
      'Mới tạo': 4,
      Hủy: 3,
    });

    // Tồn kho khả dụng sau seed giữ nguyên số liệu đóng băng 02/11/2026.
    const nm25 = await inventory.get('NM-25');
    expect(nm25?.stock).toBe(486);
    const hsKho = await inventory.get('HS-KHO');
    expect(hsKho?.stock).toBe(304);
    const nm40 = await inventory.get('NM-40');
    expect(nm40?.stock).toBe(452);
    expect((await inventory.list()).length).toBe(40);

    // Shipment: 71 đơn đã giao hàng (63 Hoàn + 8 Đã giao), 5 đơn còn
    // đang giao giữ 5 tài xế và 5 xe, 2 shipment giao thất bại.
    expect(
      (await shipments.list({ status: 'Đã giao' })).length,
    ).toBe(71);
    expect(
      (await shipments.list({ status: 'Đang giao' })).length,
    ).toBe(5);
    expect(
      (await shipments.list({ status: 'Giao thất bại' })).length,
    ).toBe(2);

    // Trả hàng: 13 đơn, đúng kết quả từng loại; trả hàng chờ xử lý chỉ
    // ở đơn còn Đã giao, trả hàng đã quyết định chỉ ở đơn đã Hoàn.
    const allReturns = await returns.list();
    expect(allReturns).toHaveLength(13);
    const outcomes = new Map<string, number>();
    for (const ret of allReturns) {
      outcomes.set(ret.status, (outcomes.get(ret.status) ?? 0) + 1);
    }
    expect(Object.fromEntries(outcomes)).toEqual({
      'Đã hoàn tiền': 5,
      'Đã duyệt': 3,
      'Chờ xử lý': 3,
      'Đã từ chối': 2,
    });
    for (const ret of allReturns) {
      const order = await orders.findOne(ret.orderId);
      if (ret.status === 'Chờ xử lý') {
        expect(order.state).toBe('Đã giao');
      } else {
        expect(order.state).toBe('Hoàn');
      }
    }

    // Mọi thời điểm đều không vượt quá mốc chạy seed 23/11/2026 00:00
    // UTC, lịch sử đơn tăng dần theo luồng, audit vẫn kiểm tra được.
    const cap = Date.parse('2026-11-23T00:00:00.000Z');
    for (const order of historical) {
      expect(Date.parse(order.createdAt)).toBeLessThanOrEqual(cap);
      let previous = 0;
      for (const step of order.history) {
        const at = Date.parse(step.at);
        expect(at).toBeGreaterThanOrEqual(previous);
        expect(at).toBeLessThanOrEqual(cap);
        previous = at;
      }
    }
    expect((await audit.verify()).valid).toBe(true);
  });

  it('đồng bộ logic mới: đơn Mới tạo chưa có tin cậy, đơn Đã kiểm tra trở đi không rủi ro cao', async () => {
    const { orders, seed } = await buildStack();
    await seed.onApplicationBootstrap();

    const all = await orders.list();
    // Đơn Mới tạo chỉ lưu chuỗi thô, chưa tách, chưa chấm điểm.
    const fresh = all.filter((order) => order.state === 'Mới tạo');
    expect(fresh.length).toBeGreaterThan(0);
    for (const order of fresh) {
      expect(order.addressTrust).toBeNull();
      expect(order.addressLevel).toBeNull();
    }
    // Đơn đã qua vòng phân tách địa chỉ (Đã kiểm tra trở đi) không được
    // ở mức rủi ro cao.
    const checked = all.filter((order) => order.state !== 'Mới tạo');
    expect(checked.length).toBeGreaterThan(0);
    for (const order of checked) {
      expect(order.addressTrust).not.toBeNull();
      expect(order.addressTrust as number).toBeGreaterThanOrEqual(70);
      expect(order.addressLevel).not.toBe('Rủi ro cao');
    }
  });

  it('chạy lại thì bỏ qua, không nạp trùng', async () => {
    const { orders, seed } = await buildStack();
    await seed.onApplicationBootstrap();
    await seed.onApplicationBootstrap();
    expect((await orders.list()).length).toBe(120);
  });

  it('kho thiếu SKU thì bỏ qua, không ném lỗi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-thieu-sku-'));
    try {
      const path = join(dir, 'historical-orders.seed.json');
      writeFileSync(
        path,
        JSON.stringify({
          items: [
            {
              idempotencyKey: 'hist-thieu-sku',
              customer: 'Hộ nước mắm A',
              items: [{ sku: 'SKU-KHONG-CO', quantity: 1 }],
              createdAt: '2026-11-20T02:00:00.000Z',
              targetState: 'Mới tạo',
            },
          ],
        }),
      );
      process.env.HISTORICAL_SEED_PATH = path;
      const { orders, seed } = await buildStack();
      await expect(seed.onApplicationBootstrap()).resolves.toBeUndefined();
      expect((await orders.list()).length).toBe(8);
    } finally {
      delete process.env.HISTORICAL_SEED_PATH;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('generate-sample-data', () => {
  it('chạy 2 lần ra cùng kết quả byte giống nhau', () => {
    const script = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'scripts',
      'generate-sample-data.mjs',
    );
    const dirA = mkdtempSync(join(tmpdir(), 'seed-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'seed-b-'));
    try {
      execFileSync(process.execPath, [script, '--out', dirA], {
        encoding: 'utf-8',
      });
      execFileSync(process.execPath, [script, '--out', dirB], {
        encoding: 'utf-8',
      });
      expect(
        readFileSync(join(dirA, 'inventory.seed.json'), 'utf-8'),
      ).toBe(readFileSync(join(dirB, 'inventory.seed.json'), 'utf-8'));
      expect(
        readFileSync(join(dirA, 'historical-orders.seed.json'), 'utf-8'),
      ).toBe(
        readFileSync(join(dirB, 'historical-orders.seed.json'), 'utf-8'),
      );
      const inventory = JSON.parse(
        readFileSync(join(dirA, 'inventory.seed.json'), 'utf-8') as string,
      ) as { items: unknown[] };
      const historical = JSON.parse(
        readFileSync(
          join(dirA, 'historical-orders.seed.json'),
          'utf-8',
        ) as string,
      ) as { items: unknown[] };
      expect(inventory.items).toHaveLength(40);
      expect(historical.items).toHaveLength(112);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});
