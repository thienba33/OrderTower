// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
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
import { HistoricalSeedService } from '../seed/historical-seed.service';
import { ShipmentGateAdapter } from '../shipments/shipment-gate.adapter';
import { ShipmentsService } from '../shipments/shipment.service';
import { InMemoryShipmentStore } from '../shipments/shipment.store';
import type { ShipmentStore } from '../shipments/shipment.types';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { BiService } from './bi.service';
import { InMemoryBiStore } from './bi.store';

// Dựng toàn bộ service trên bộ nhớ, giống khởi động thật (sao từ
// src/seed/historical-seed.service.spec.ts): kho, kênh, xe, tài xế và 8
// đơn demo đều nạp từ tệp seed thật; cổng shipment và cổng trả hàng dùng
// adapter thật trên cùng kho để chuyển đơn theo sự kiện shipment và đóng
// đơn bằng returnId chạy như chạy thật.
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
  const bi = new BiService(
    new InMemoryBiStore(),
    orders,
    inventory,
    returns,
    audit,
    approvals,
  );
  return { orders, returns, inventory, audit, approvals, seed, bi };
}

// Kiểm tra lớp BI trên bộ dữ liệu mẫu đóng băng mốc 3 (40 SKU, 120 đơn,
// 13 đơn hoàn, ngày tham chiếu 22/11/2026): mọi số đều phải khớp số liệu
// đã công bố trong src/seed/data/README.md. Nếu 1 số lệch thì hoặc seed
// đổi, hoặc quy tắc BI sai, không được sửa test cho khớp mà không rõ lý
// do.
describe('BiService trên dữ liệu mẫu đóng băng', () => {
  it('ngày tham chiếu 22/11/2026, 9 bất thường, 9 đề xuất chờ duyệt', async () => {
    const { seed, bi } = await buildStack();
    await seed.onApplicationBootstrap();

    const { referenceDate, rows } = await bi.forecast();
    expect(referenceDate).toBe('2026-11-22');
    const skuRows = rows.filter((row) => row.channelId === null);
    expect(skuRows).toHaveLength(40);
    const nm35 = skuRows.find((row) => row.sku === 'NM-35');
    expect(nm35?.salesLast7d).toBe(17);
    expect(nm35?.salesPrev7d).toBe(7);
    expect(nm35?.stock).toBe(5);
    expect(nm35?.daysLeft).toBeCloseTo(2.06, 2);
    // 6 SKU tồn kho sắp hết còn lại: số ngày còn lại khớp README seed
    // (3,5 ngày cho NM-10/NM-20/NM-50/NM-RUOC, 4,7 ngày cho NM-CA và
    // HS-MUC-500).
    const expectedDaysLeft: Record<string, number> = {
      'NM-10': 3.5,
      'NM-20': 3.5,
      'NM-50': 3.5,
      'NM-RUOC': 3.5,
      'NM-CA': 4.67,
      'HS-MUC-500': 4.67,
    };
    for (const [sku, days] of Object.entries(expectedDaysLeft)) {
      const row = skuRows.find((item) => item.sku === sku);
      expect(row?.daysLeft).toBeCloseTo(days, 2);
    }

    const { anomalies } = await bi.anomalies();
    expect(anomalies.map((item) => item.key)).toEqual([
      'ton-kho-sap-het:HS-MUC-500',
      'ton-kho-sap-het:NM-10',
      'ton-kho-sap-het:NM-20',
      'ton-kho-sap-het:NM-35',
      'ton-kho-sap-het:NM-50',
      'ton-kho-sap-het:NM-CA',
      'ton-kho-sap-het:NM-RUOC',
      'ty-le-hoan-cao:K-1001',
      'cau-tang-dot-bien:NM-35',
    ]);
    const chat = anomalies.find(
      (item) => item.key === 'ty-le-hoan-cao:K-1001',
    );
    expect(chat?.inputs.channelReturnRate).toBe(45);
    expect(chat?.inputs.overallReturnRate).toBeCloseTo(18.31, 2);
    expect(chat?.inputs.channelReturns).toBe(9);
    expect(chat?.inputs.overallReturns).toBe(13);

    const recs = await bi.listRecommendations();
    expect(recs).toHaveLength(9);
    expect(recs.every((rec) => rec.status === 'Chờ duyệt')).toBe(true);
  });

  it('DX-Score v1 trên dữ liệu mẫu: P 15, D 30, I 0, H 55, tổng 100', async () => {
    const { seed, bi } = await buildStack();
    await seed.onApplicationBootstrap();

    const score = await bi.dxScore();
    expect(score.formulaVersion).toBe('v1');
    expect(score.referenceDate).toBe('2026-11-22');
    // P: 66/66 đơn đã đóng đi tròn luồng (2 đơn giao thất bại đích là
    // Chờ điều xe, chưa đóng, nên không tính vào P1); chưa có lần thử
    // chuyển trái phép nào nên P2 chưa đo -> P = 30 x (1 + 0) / 2 = 15.
    expect(score.p.score).toBe(15);
    expect(score.p.closedWithoutDetour.value).toBe(1);
    expect(score.p.closedWithoutDetour.n).toBe(66);
    expect(score.p.illegalBlocked.measured).toBe(false);
    // D: chỉ số BI đều kèm nguồn và ngày tham chiếu; 120/120 đơn có phả
    // hệ đầy đủ -> D = 30.
    expect(score.d.score).toBe(30);
    expect(score.d.attributedIndicators.measured).toBe(true);
    expect(score.d.fullLineage.value).toBe(1);
    expect(score.d.fullLineage.n).toBe(120);
    // I: chưa có đề xuất nào được duyệt -> chưa đo, 0 điểm, mẫu nhỏ.
    expect(score.i.score).toBe(0);
    expect(score.i.correctApproved.measured).toBe(false);
    expect(score.i.correctApproved.n).toBe(0);
    expect(score.i.smallSample).toBe(true);
    // H = 100 - 15 - 30 - 0 = 55. Tỷ lệ ngoại lệ: 3 đơn hủy + 13 đơn có
    // trả hàng + 2 đơn giao thất bại (không trùng nhau) = 18/120.
    expect(score.h.score).toBe(55);
    expect(score.h.exceptionRatio.value).toBe(0.15);
    expect(score.h.exceptionRatio.n).toBe(120);
    // Tỷ lệ bước làm tay 146/1110 = 0,13: 146 bản ghi audit do tài xế ghi
    // (xác nhận giao hàng 71, chuyển đơn theo giao hàng 73, báo giao thất
    // bại 2), còn lại 964 bản ghi do seed ghi.
    expect(score.h.manualStepRatio.value).toBe(0.13);
    expect(score.h.manualStepRatio.n).toBe(1110);
    // Seed không tạo phê duyệt chung nên 2 chỉ số phê duyệt rỗng.
    expect(score.h.avgApprovalWaitMsByType).toEqual([]);
    expect(score.h.decisionsPerPersonPerDayByRole).toEqual([]);
    expect(score.total).toBe(100);

    // Tính lại 2 lần trên cùng dữ liệu ra cùng 1 số (xác định).
    const again = await bi.dxScore();
    expect(again.p).toEqual(score.p);
    expect(again.d).toEqual(score.d);
    expect(again.i).toEqual(score.i);
    expect(again.h).toEqual(score.h);
    expect(again.total).toBe(score.total);
    const latest = await bi.latestDxScoreSnapshot();
    expect(latest?.total).toBe(100);
  });
});
