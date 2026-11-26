// SPDX-License-Identifier: Apache-2.0
import type { Approval } from '../approvals/approval.types';
import type { AuditRecord } from '../audit/audit.types';
import type { Caller } from '../auth/auth.types';
import type { InventoryItem } from '../inventory/inventory.types';
import type { Order } from '../orders/orders.types';
import type { Return } from '../returns/return.types';
import { BiService } from './bi.service';
import { InMemoryBiStore } from './bi.store';
import type { Anomaly } from './bi.types';

// Ngày tham chiếu của bộ dữ liệu tổng hợp: 22/11/2026. Cửa sổ 7 ngày gần
// nhất = 16/11-22/11, cửa sổ trước đó = 09/11-15/11.
const REF = '2026-11-22';

function makeOrder(overrides: Partial<Order> & { id: string }): Order {
  return {
    id: overrides.id,
    idempotencyKey: `key-${overrides.id}`,
    customer: 'Hộ nước mắm A',
    phone: '0901234567',
    items: overrides.items ?? [{ sku: 'NM-25', quantity: 1 }],
    total: 0,
    deadline: null,
    channelId: overrides.channelId ?? 'K-1001',
    customerId: null,
    addressTrust: null,
    addressLevel: null,
    workflowInstanceId: `WF-${overrides.id}`,
    state: overrides.state ?? 'Mới tạo',
    history: overrides.history ?? [
      {
        from: null,
        to: 'Mới tạo',
        by: 'seed',
        role: 'Quản trị viên',
        at: overrides.createdAt ?? `${REF}T10:00:00.000Z`,
      },
    ],
    createdAt: overrides.createdAt ?? `${REF}T10:00:00.000Z`,
    updatedAt: overrides.createdAt ?? `${REF}T10:00:00.000Z`,
  };
}

function makeInventory(overrides: Partial<InventoryItem> & { sku: string }): InventoryItem {
  return {
    sku: overrides.sku,
    name: overrides.name ?? overrides.sku,
    unit: 'chai',
    unitPrice: overrides.unitPrice ?? 100000,
    stock: overrides.stock ?? 100,
    reserved: 0,
  };
}

function makeReturn(overrides: Partial<Return> & { id: string; orderId: string }): Return {
  return {
    id: overrides.id,
    orderId: overrides.orderId,
    reason: 'Hàng lỗi',
    status: overrides.status ?? 'Đã duyệt',
    createdAt: `${REF}T10:00:00.000Z`,
    updatedAt: `${REF}T10:00:00.000Z`,
  };
}

function makeAudit(overrides: Partial<AuditRecord> & { action: string; orderId: string }): AuditRecord {
  return {
    seq: overrides.seq ?? 1,
    at: overrides.at ?? `${REF}T10:00:00.000Z`,
    actor: overrides.actor ?? 'seed',
    role: overrides.role ?? 'Quản trị viên',
    action: overrides.action,
    orderId: overrides.orderId,
    from: null,
    to: null,
    detail: '',
    prevHash: '0',
    hash: '0',
  };
}

const MANAGER: Caller = {
  userId: 'manager',
  username: 'manager',
  roles: ['Quản lý'],
};
const CSKH: Caller = {
  userId: 'cskh',
  username: 'cskh',
  roles: ['Nhân viên chăm sóc khách hàng'],
};

interface StubData {
  orders?: Order[];
  inventory?: InventoryItem[];
  returns?: Return[];
  audit?: AuditRecord[];
  approvals?: Approval[];
}

function buildService(data: StubData = {}): BiService {
  const orders = {
    list: async () => data.orders ?? [],
  };
  const inventory = {
    list: async () => data.inventory ?? [],
  };
  const returns = {
    list: async () => data.returns ?? [],
  };
  const audit = {
    getAll: async () => data.audit ?? [],
  };
  const approvals = {
    list: async () => data.approvals ?? [],
  };
  return new BiService(
    new InMemoryBiStore(),
    orders as unknown as import('../orders/orders.service').OrdersService,
    inventory as unknown as import('../inventory/inventory.service').InventoryService,
    returns as unknown as import('../returns/return.service').ReturnsService,
    audit as unknown as import('../audit/audit.service').AuditService,
    approvals as unknown as import('../approvals/approval.service').ApprovalService,
  );
}

describe('BiService forecast', () => {
  it('tính tốc độ bán, dự báo 7 ngày và số ngày tồn kho theo SKU', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-35', quantity: 17 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
        makeOrder({
          id: 'LS-2',
          items: [{ sku: 'NM-35', quantity: 7 }],
          createdAt: '2026-11-12T10:00:00.000Z',
          state: 'Hoàn',
        }),
        makeOrder({
          id: 'LS-3',
          items: [{ sku: 'NM-35', quantity: 5 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hủy',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-35', stock: 5 })],
    });
    const { referenceDate, rows } = await service.forecast();
    // Ngày tham chiếu là ngày tạo đơn mới nhất (20/11), không phải ngày
    // hiện tại: đơn LS-1/LS-3 ngày 20/11, đơn LS-2 ngày 12/11.
    expect(referenceDate).toBe('2026-11-20');
    expect(rows).toHaveLength(2);
    const skuRow = rows.find((row) => row.channelId === null);
    expect(skuRow?.salesLast7d).toBe(17);
    expect(skuRow?.salesPrev7d).toBe(7);
    expect(skuRow?.velocityPerDay).toBeCloseTo(17 / 7, 2);
    // Đơn hủy không tính doanh số: 5 đơn vị của LS-3 không vào dự báo.
    expect(skuRow?.forecast7d).toBe(17);
    expect(skuRow?.daysLeft).toBeCloseTo(5 / (17 / 7), 2);
    expect(skuRow?.status).toBe('binh-thuong');
    const channelRow = rows.find((row) => row.channelId === 'K-1001');
    expect(channelRow?.forecast7d).toBe(17);
  });

  it('tốc độ 0 thì ghi không bán, không tính số ngày tồn kho', async () => {
    const service = buildService({
      orders: [],
      inventory: [makeInventory({ sku: 'NM-40', stock: 452 })],
    });
    const { referenceDate, rows } = await service.forecast();
    expect(referenceDate).toBeNull();
    expect(rows).toEqual([]);
  });

  it('ngày tham chiếu loại 8 đơn demo có createdAt là giờ khởi động', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'DH-1001',
          createdAt: '2026-11-23T08:00:00.000Z',
          state: 'Mới tạo',
        }),
        makeOrder({
          id: 'LS-1001',
          createdAt: '2026-11-22T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-25', stock: 486 })],
    });
    const { referenceDate } = await service.forecast();
    expect(referenceDate).toBe('2026-11-22');
  });

  it('đơn chưa giao không tính doanh số', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-35', quantity: 10 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Chờ kho',
        }),
        makeOrder({
          id: 'LS-2',
          items: [{ sku: 'NM-35', quantity: 3 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-35', stock: 100 })],
    });
    const { rows } = await service.forecast();
    const skuRow = rows.find((row) => row.channelId === null);
    // Chỉ 3 đơn vị của đơn đã giao tính doanh số, 10 đơn vị của đơn đang
    // chờ kho chưa phải hàng đã bán.
    expect(skuRow?.salesLast7d).toBe(3);
    expect(skuRow?.forecast7d).toBe(3);
  });
});

describe('BiService anomalies', () => {
  it('phát hiện tồn kho sắp hết khi số ngày còn lại dưới 7 và có đơn bán', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-10', quantity: 2 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-10', stock: 1 })],
    });
    const { anomalies } = await service.anomalies();
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].key).toBe('ton-kho-sap-het:NM-10');
    expect(anomalies[0].inputs.daysLeft).toBeCloseTo(3.5, 2);
    expect(anomalies[0].inputs.stock).toBe(1);
  });

  it('không báo tồn kho sắp hết khi số ngày còn lại đúng 7', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-10', quantity: 7 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-10', stock: 7 })],
    });
    const { anomalies } = await service.anomalies();
    expect(anomalies).toEqual([]);
  });

  it('phát hiện tỷ lệ hoàn kênh vượt chung hơn 10 điểm phần trăm', async () => {
    const orders: Order[] = [];
    const returns: Return[] = [];
    // Kênh Chat: 20 đơn đã giao, 9 đơn hoàn (45%). Kênh Web: 20 đơn đã
    // giao, 1 đơn hoàn (5%). Tỷ lệ chung 10/40 = 25%, Chat vượt 20 điểm.
    for (let i = 1; i <= 20; i += 1) {
      orders.push(
        makeOrder({
          id: `CH-${i}`,
          channelId: 'K-1001',
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      );
      orders.push(
        makeOrder({
          id: `WE-${i}`,
          channelId: 'K-1002',
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      );
    }
    for (let i = 1; i <= 9; i += 1) {
      returns.push(makeReturn({ id: `TH-C${i}`, orderId: `CH-${i}` }));
    }
    returns.push(makeReturn({ id: 'TH-W1', orderId: 'WE-1' }));
    const service = buildService({ orders, inventory: [], returns });
    const { anomalies } = await service.anomalies();
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].key).toBe('ty-le-hoan-cao:K-1001');
    expect(anomalies[0].inputs.channelReturnRate).toBe(45);
    expect(anomalies[0].inputs.overallReturnRate).toBe(25);
  });

  it('không báo tỷ lệ hoàn khi kênh chỉ có 2 đơn hoàn', async () => {
    const orders: Order[] = [];
    const returns: Return[] = [];
    for (let i = 1; i <= 10; i += 1) {
      orders.push(
        makeOrder({
          id: `CH-${i}`,
          channelId: 'K-1001',
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      );
    }
    returns.push(makeReturn({ id: 'TH-1', orderId: 'CH-1' }));
    returns.push(makeReturn({ id: 'TH-2', orderId: 'CH-2' }));
    const service = buildService({ orders, inventory: [], returns });
    const { anomalies } = await service.anomalies();
    expect(anomalies).toEqual([]);
  });

  it('phát hiện cầu tăng đột biến khi gấp hơn 2 lần mốc tối thiểu 5', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-35', quantity: 17 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
        makeOrder({
          id: 'LS-2',
          items: [{ sku: 'NM-35', quantity: 7 }],
          createdAt: '2026-11-12T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-35', stock: 500 })],
    });
    const { anomalies } = await service.anomalies();
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].key).toBe('cau-tang-dot-bien:NM-35');
    expect(anomalies[0].inputs.ratio).toBeCloseTo(17 / 7, 2);
  });

  it('không báo cầu tăng khi mốc dưới 5 đơn vị', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-35', quantity: 12 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
        makeOrder({
          id: 'LS-2',
          items: [{ sku: 'NM-35', quantity: 4 }],
          createdAt: '2026-11-12T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-35', stock: 500 })],
    });
    const { anomalies } = await service.anomalies();
    expect(anomalies).toEqual([]);
  });

  it('tạo đề xuất từ bất thường và không tạo trùng khi gọi lại', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-10', quantity: 2 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-10', stock: 1 })],
    });
    await service.anomalies();
    await service.anomalies();
    const recs = await service.listRecommendations();
    expect(recs).toHaveLength(1);
    expect(recs[0].anomalyKey).toBe('ton-kho-sap-het:NM-10');
    expect(recs[0].status).toBe('Chờ duyệt');
    // Dự báo 7 ngày = 2 đơn vị, tồn kho 1 -> nhập thêm 1 đơn vị.
    expect(recs[0].action).toContain('Nhập thêm 1 đơn vị');
  });
});

describe('BiService decisions and feedback', () => {
  async function serviceWithOneRecommendation(): Promise<{
    service: BiService;
    id: string;
  }> {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-10', quantity: 2 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-10', stock: 1 })],
    });
    await service.anomalies();
    const recs = await service.listRecommendations();
    return { service, id: recs[0].id };
  }

  it('Quản lý duyệt đề xuất được, duyệt lại thì 409', async () => {
    const { service, id } = await serviceWithOneRecommendation();
    const decided = await service.decideRecommendation(
      id,
      { decision: 'approved' },
      MANAGER,
    );
    expect(decided.status).toBe('Đã duyệt');
    expect(decided.decidedBy).toBe('manager');
    await expect(
      service.decideRecommendation(id, { decision: 'approved' }, MANAGER),
    ).rejects.toThrow('đã được quyết định');
  });

  it('từ chối bắt buộc có lý do', async () => {
    const { service, id } = await serviceWithOneRecommendation();
    await expect(
      service.decideRecommendation(id, { decision: 'rejected' }, MANAGER),
    ).rejects.toThrow('bắt buộc phải có lý do');
    const decided = await service.decideRecommendation(
      id,
      { decision: 'rejected', reason: 'Kho còn đủ hàng khác thay thế.' },
      MANAGER,
    );
    expect(decided.status).toBe('Đã từ chối');
    expect(decided.decisionReason).toBe('Kho còn đủ hàng khác thay thế.');
  });

  it('CSKH không được quyết định đề xuất (409)', async () => {
    const { service, id } = await serviceWithOneRecommendation();
    await expect(
      service.decideRecommendation(id, { decision: 'approved' }, CSKH),
    ).rejects.toThrow('Chỉ Quản lý hoặc Quản trị viên');
  });

  it('quyết định đề xuất không có thì 404', async () => {
    const service = buildService({});
    await expect(
      service.decideRecommendation(
        'DX-9999',
        { decision: 'approved' },
        MANAGER,
      ),
    ).rejects.toThrow('Không tìm thấy đề xuất');
  });

  it('ghi phản hồi cho đề xuất đã duyệt, mỗi đề xuất tối đa 1 phản hồi', async () => {
    const { service, id } = await serviceWithOneRecommendation();
    await expect(
      service.recordFeedback(id, { correct: true }, MANAGER),
    ).rejects.toThrow('Chỉ ghi phản hồi cho đề xuất đã duyệt');
    await service.decideRecommendation(id, { decision: 'approved' }, MANAGER);
    const feedback = await service.recordFeedback(
      id,
      { correct: true, note: 'Nhập thêm bán hết trong 3 ngày.' },
      MANAGER,
    );
    expect(feedback.correct).toBe(true);
    await expect(
      service.recordFeedback(id, { correct: false }, MANAGER),
    ).rejects.toThrow('đã có phản hồi');
  });
});

describe('BiService dx-score', () => {
  it('tính đủ 4 trục P/D/I/H, tổng luôn 100, trục I đo được khi có phê duyệt', async () => {
    const closedOrder = makeOrder({
      id: 'LS-1',
      state: 'Hoàn',
      history: [
        { from: null, to: 'Mới tạo', by: 'seed', role: 'Quản trị viên', at: `${REF}T10:00:00.000Z` },
        { from: 'Mới tạo', to: 'Đã kiểm tra', by: 'seed', role: 'Quản trị viên', at: `${REF}T11:00:00.000Z` },
        { from: 'Đã kiểm tra', to: 'Chờ kho', by: 'seed', role: 'Quản trị viên', at: `${REF}T12:00:00.000Z` },
        { from: 'Chờ kho', to: 'Hoàn', by: 'seed', role: 'Quản trị viên', at: `${REF}T13:00:00.000Z` },
      ],
    });
    const detourOrder = makeOrder({
      id: 'LS-2',
      state: 'Hoàn',
      history: [
        { from: null, to: 'Mới tạo', by: 'seed', role: 'Quản trị viên', at: `${REF}T10:00:00.000Z` },
        { from: 'Mới tạo', to: 'Chờ điều xe', by: 'seed', role: 'Quản trị viên', at: `${REF}T11:00:00.000Z` },
        { from: 'Chờ điều xe', to: 'Đang giao', by: 'seed', role: 'Quản trị viên', at: `${REF}T12:00:00.000Z` },
        { from: 'Đang giao', to: 'Chờ điều xe', by: 'seed', role: 'Quản trị viên', at: `${REF}T13:00:00.000Z` },
        { from: 'Chờ điều xe', to: 'Hoàn', by: 'seed', role: 'Quản trị viên', at: `${REF}T14:00:00.000Z` },
      ],
    });
    const service = buildService({
      orders: [closedOrder, detourOrder],
      inventory: [makeInventory({ sku: 'NM-25', stock: 486 })],
      audit: [
        makeAudit({ action: 'order.created', orderId: 'LS-1' }),
        makeAudit({ action: 'order.created', orderId: 'LS-2' }),
        makeAudit({ action: 'order.transition.denied', orderId: 'LS-1' }),
        makeAudit({
          action: 'approval.approved',
          orderId: 'LS-1',
          actor: 'manager',
          role: 'Quản lý',
          at: '2026-11-20T10:00:00.000Z',
        }),
      ],
      approvals: [
        {
          id: 'AP-1',
          type: 'order.edit.closed',
          subjectId: 'LS-1',
          reason: 'Sửa địa chỉ',
          requestedBy: 'son',
          requestedAt: '2026-11-20T09:00:00.000Z',
          status: 'approved',
          decidedBy: 'manager',
          decidedAt: '2026-11-20T10:00:00.000Z',
          decisionReason: null,
          appliedAt: null,
        },
      ],
    });
    await service.anomalies();
    const recs = await service.listRecommendations();
    expect(recs).toHaveLength(0);
    // 1 đề xuất duyệt tay để trục I đo được: tạo bất thường rồi duyệt.
    const lowStock = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-10', quantity: 2 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-10', stock: 1 })],
    });
    await lowStock.anomalies();
    const lowRecs = await lowStock.listRecommendations();
    await lowStock.decideRecommendation(
      lowRecs[0].id,
      { decision: 'approved' },
      MANAGER,
    );
    await lowStock.recordFeedback(lowRecs[0].id, { correct: true }, MANAGER);

    const score = await lowStock.dxScore();
    expect(score.formulaVersion).toBe('v1');
    // Đơn trong bộ này tạo ngày 20/11 nên ngày tham chiếu là 20/11.
    expect(score.referenceDate).toBe('2026-11-20');
    expect(score.total).toBe(100);
    expect(score.i.score).toBe(30);
    expect(score.i.correctApproved.value).toBe(1);
    expect(score.i.smallSample).toBe(true);

    const main = await service.dxScore();
    // P: 1/2 đơn đóng đi tròn luồng, có 1 lần chặn trái phép -> P1 = 0.5,
    // P2 = 1 -> P = 30 x (0.5 + 1) / 2 = 22.5.
    expect(main.p.score).toBe(22.5);
    expect(main.p.closedWithoutDetour.value).toBe(0.5);
    expect(main.p.illegalBlocked.value).toBe(1);
    // D: chỉ số BI có nguồn (2 dòng dự báo: SKU + kênh), phả hệ đủ 2/2
    // -> D = 30.
    expect(main.d.score).toBe(30);
    expect(main.d.fullLineage.value).toBe(1);
    // I: chưa có đề xuất nào được duyệt -> chưa đo, 0 điểm.
    expect(main.i.score).toBe(0);
    expect(main.i.correctApproved.measured).toBe(false);
    expect(main.i.correctApproved.n).toBe(0);
    // H = 100 - 22.5 - 30 - 0 = 47.5.
    expect(main.h.score).toBe(47.5);
    expect(main.total).toBe(100);
    // H: 1 bước tay trên 4 bản ghi; 1 lần duyệt mất 1 giờ; 1 quyết định
    // của Quản lý ngày 20/11; 1/2 đơn ngoại lệ (đơn đi đường vòng).
    expect(main.h.manualStepRatio.value).toBe(0.25);
    expect(main.h.avgApprovalWaitMsByType).toEqual([
      { type: 'order.edit.closed', avgMs: 3600000, n: 1 },
    ]);
    expect(main.h.decisionsPerPersonPerDayByRole).toEqual([
      { role: 'Quản lý', date: '2026-11-20', count: 1 },
    ]);
    expect(main.h.exceptionRatio.value).toBe(0.5);
  });

  it('mẫu số 0 thì ghi chưa đo, 0 điểm, không ước lượng', async () => {
    const service = buildService({});
    const score = await service.dxScore();
    expect(score.p.score).toBe(0);
    expect(score.d.score).toBe(0);
    expect(score.i.score).toBe(0);
    expect(score.h.score).toBe(100);
    expect(score.total).toBe(100);
    expect(score.p.closedWithoutDetour.measured).toBe(false);
    expect(score.p.illegalBlocked.measured).toBe(false);
    expect(score.d.attributedIndicators.measured).toBe(false);
    expect(score.d.fullLineage.measured).toBe(false);
    expect(score.i.correctApproved.measured).toBe(false);
    expect(score.i.smallSample).toBe(true);
    expect(score.h.manualStepRatio.measured).toBe(false);
    expect(score.h.exceptionRatio.measured).toBe(false);
  });

  it('tính 2 lần trên cùng dữ liệu ra cùng 1 số (xác định)', async () => {
    const service = buildService({
      orders: [
        makeOrder({
          id: 'LS-1',
          items: [{ sku: 'NM-35', quantity: 17 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      ],
      inventory: [makeInventory({ sku: 'NM-35', stock: 5 })],
      audit: [makeAudit({ action: 'order.created', orderId: 'LS-1' })],
    });
    const first = await service.dxScore();
    const second = await service.dxScore();
    expect(second.p).toEqual(first.p);
    expect(second.d).toEqual(first.d);
    expect(second.i).toEqual(first.i);
    expect(second.h).toEqual(first.h);
    expect(second.total).toBe(first.total);
    const latest = await service.latestDxScoreSnapshot();
    expect(latest?.total).toBe(first.total);
  });
});

describe('S11 pilot test set', () => {
  // Bộ kiểm tra S11 (mục 4 bản dự thảo): 20 cặp SKU/kênh có nhu cầu đã
  // biết + 20 tình huống bất thường đã biết (7 tồn kho sắp hết, 7 tỷ lệ
  // hoàn cao theo kênh, 6 cầu tăng đột biến), xây từ dữ liệu tổng hợp
  // thay vì dữ liệu mẫu thật (chỉ có 3 kênh thật nên 7 trường hợp hoàn
  // cao là kịch bản tổng hợp, không phải 7 kênh thật).
  it('dự báo đúng 20/20 cặp SKU/kênh và phát hiện đúng 20/20 bất thường', async () => {
    const orders: Order[] = [];
    const inventory: InventoryItem[] = [];
    const returns: Return[] = [];
    const knownDemand = new Map<string, number>();

    // 20 cặp SKU/kênh có nhu cầu đã biết: 10 SKU x 2 kênh, mỗi cặp bán
    // đúng số lượng đã định trong 7 ngày gần nhất, nhu cầu phẳng (7 ngày
    // trước đó bằng đúng 7 ngày gần nhất) và tồn kho dư để không sinh
    // bất thường ngoài ý muốn.
    const pairSkus = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
    for (const sku of pairSkus) {
      inventory.push(makeInventory({ sku, stock: 1000 }));
      for (const channelId of ['K-1001', 'K-1002']) {
        const qty = 10 + pairSkus.indexOf(sku) * 2 + (channelId === 'K-1002' ? 1 : 0);
        knownDemand.set(`${sku}|${channelId}`, qty);
        orders.push(
          makeOrder({
            id: `P-${sku}-${channelId}`,
            channelId,
            items: [{ sku, quantity: qty }],
            createdAt: '2026-11-20T10:00:00.000Z',
            state: 'Hoàn',
          }),
        );
        orders.push(
          makeOrder({
            id: `P-${sku}-${channelId}-prev`,
            channelId,
            items: [{ sku, quantity: qty }],
            createdAt: '2026-11-12T10:00:00.000Z',
            state: 'Hoàn',
          }),
        );
      }
    }

    // 7 tồn kho sắp hết: mỗi SKU bán 2 đơn vị trong 7 ngày gần nhất,
    // tồn kho chỉ còn 1 đơn vị (còn 3,5 ngày).
    const lowSkus = Array.from({ length: 7 }, (_, i) => `L${i + 1}`);
    for (const sku of lowSkus) {
      inventory.push(makeInventory({ sku, stock: 1 }));
      orders.push(
        makeOrder({
          id: `L-${sku}`,
          channelId: 'K-1001',
          items: [{ sku, quantity: 2 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      );
    }

    // 7 tỷ lệ hoàn cao theo kênh: mỗi kênh 10 đơn đã giao, 4 đơn hoàn
    // (40%); 1 kênh nền 100 đơn đã giao, 5 đơn hoàn (5%). Tỷ lệ chung
    // 33/170 = 19,4%, mỗi kênh cao hơn 20,6 điểm phần trăm.
    const neutralSku = 'NEUTRAL';
    inventory.push(makeInventory({ sku: neutralSku, stock: 10000 }));
    for (let c = 1; c <= 7; c += 1) {
      const channelId = `K-H${c}`;
      for (let i = 1; i <= 10; i += 1) {
        orders.push(
          makeOrder({
            id: `H-${channelId}-${i}`,
            channelId,
            items: [{ sku: neutralSku, quantity: 1 }],
            createdAt: '2026-11-20T10:00:00.000Z',
            state: 'Hoàn',
          }),
        );
      }
      for (let i = 1; i <= 4; i += 1) {
        returns.push(
          makeReturn({ id: `TH-${channelId}-${i}`, orderId: `H-${channelId}-${i}` }),
        );
      }
    }
    for (let i = 1; i <= 100; i += 1) {
      orders.push(
        makeOrder({
          id: `N-${i}`,
          channelId: 'K-1001',
          items: [{ sku: neutralSku, quantity: 1 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      );
    }
    for (let i = 1; i <= 5; i += 1) {
      returns.push(makeReturn({ id: `TH-N-${i}`, orderId: `N-${i}` }));
    }

    // 6 cầu tăng đột biến: mỗi SKU bán 12 đơn vị trong 7 ngày gần nhất,
    // gấp 2,4 lần mốc 5 đơn vị của 7 ngày trước đó.
    const spikeSkus = Array.from({ length: 6 }, (_, i) => `S${i + 1}`);
    for (const sku of spikeSkus) {
      inventory.push(makeInventory({ sku, stock: 1000 }));
      orders.push(
        makeOrder({
          id: `S-${sku}`,
          channelId: 'K-1001',
          items: [{ sku, quantity: 12 }],
          createdAt: '2026-11-20T10:00:00.000Z',
          state: 'Hoàn',
        }),
      );
      orders.push(
        makeOrder({
          id: `S-${sku}-prev`,
          channelId: 'K-1001',
          items: [{ sku, quantity: 5 }],
          createdAt: '2026-11-12T10:00:00.000Z',
          state: 'Hoàn',
        }),
      );
    }

    const service = buildService({ orders, inventory, returns });
    const { rows } = await service.forecast();
    let correctPairs = 0;
    for (const [key, qty] of knownDemand) {
      const [sku, channelId] = key.split('|');
      const row = rows.find(
        (item) => item.sku === sku && item.channelId === channelId,
      );
      if (row?.forecast7d === qty) {
        correctPairs += 1;
      }
    }
    expect(correctPairs).toBe(20);

    const { anomalies } = await service.anomalies();
    const keys = new Set(anomalies.map((item: Anomaly) => item.key));
    for (const sku of lowSkus) {
      expect(keys.has(`ton-kho-sap-het:${sku}`)).toBe(true);
    }
    for (let c = 1; c <= 7; c += 1) {
      expect(keys.has(`ty-le-hoan-cao:K-H${c}`)).toBe(true);
    }
    for (const sku of spikeSkus) {
      expect(keys.has(`cau-tang-dot-bien:${sku}`)).toBe(true);
    }
    // Không có bất thường ngoài 20 trường hợp đã biết.
    expect(anomalies).toHaveLength(20);

    // Tỷ lệ đề xuất được duyệt / bị từ chối: bộ kiểm tra này chưa có
    // quyết định nào nên cả 2 tỷ lệ đều chưa đo (mẫu số 0), không ước
    // lượng. Đề xuất sinh ra đều ở trạng thái chờ duyệt.
    const recs = await service.listRecommendations();
    expect(recs).toHaveLength(20);
    const decided = recs.filter((rec) => rec.status !== 'Chờ duyệt');
    expect(decided).toHaveLength(0);
  });
});
