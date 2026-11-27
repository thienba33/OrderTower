// SPDX-License-Identifier: Apache-2.0
import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuditRecord } from '../audit/audit.types';
import { DbService } from '../db/db.service';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/orders.types';
import { BiLineageService } from './bi-lineage.service';
import { InMemoryBiStore } from './bi.store';
import type {
  AIFeedback,
  DxScoreSnapshot,
  Recommendation,
} from './bi.types';

function ratio(value: number, n: number) {
  return {
    value,
    n,
    measured: true,
    note: 'test',
  };
}

function snapshot(): DxScoreSnapshot {
  return {
    id: 'SN-1001',
    formulaVersion: 'v1',
    referenceDate: '2026-11-22',
    computedAt: '2026-11-22T12:00:00.000Z',
    p: {
      score: 20,
      closedWithoutDetour: ratio(0.9, 10),
      illegalBlocked: ratio(0.8, 5),
    },
    d: {
      score: 15,
      attributedIndicators: ratio(1, 4),
      fullLineage: ratio(0.8, 10),
    },
    i: {
      score: 10,
      correctApproved: ratio(0.7, 5),
      smallSample: false,
    },
    h: {
      score: 55,
      manualStepRatio: ratio(0.4, 10),
      avgApprovalWaitMsByType: [],
      decisionsPerPersonPerDayByRole: [],
      exceptionRatio: ratio(0.2, 10),
    },
    total: 100,
  };
}

function order(id: string): Order {
  return {
    id,
    idempotencyKey: `idem-${id}`,
    customer: 'Khách hàng',
    phone: '0901234567',
    items: [{ sku: 'NM-25', quantity: 2 }],
    total: 100000,
    deadline: null,
    channelId: 'K-1001',
    customerId: 'KH-1001',
    addressTrust: 90,
    addressLevel: null,
    workflowInstanceId: `WF-${id}`,
    state: 'Hoàn',
    history: [],
    createdAt: '2026-11-22T09:00:00.000Z',
    updatedAt: '2026-11-22T10:00:00.000Z',
  };
}

function recommendation(): Recommendation {
  return {
    id: 'DX-1001',
    anomalyKey: 'ton-kho-sap-het:NM-25',
    type: 'ton-kho-sap-het',
    sku: 'NM-25',
    channelId: null,
    title: 'SKU sắp hết',
    action: 'Nhập thêm',
    reason: 'Tồn kho thấp',
    inputs: { stock: 4, velocityPerDay: 2 },
    status: 'Chờ duyệt',
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: '2026-11-22T08:00:00.000Z',
    updatedAt: '2026-11-22T08:00:00.000Z',
  };
}

function feedback(): AIFeedback {
  return {
    id: 'PH-1001',
    recommendationId: 'DX-1001',
    correct: true,
    note: 'ok',
    recordedBy: 'demo.manager',
    recordedAt: '2026-11-22T11:00:00.000Z',
  };
}

function auditRecord(): AuditRecord {
  return {
    seq: 1,
    at: '2026-11-22T10:30:00.000Z',
    actor: 'demo.dispatcher',
    role: 'Điều phối viên',
    action: 'order.transition.denied',
    orderId: 'DH-1001',
    from: null,
    to: null,
    detail: 'test',
    prevHash: 'genesis',
    hash: 'hash',
  };
}

describe('BiLineageService', () => {
  let store: InMemoryBiStore;
  let ordersService: OrdersService;
  let auditService: AuditService;
  let db: DbService;
  let service: BiLineageService;

  beforeEach(() => {
    store = new InMemoryBiStore();
    ordersService = {
      list: jest.fn(async () => [order('DH-1001')]),
    } as unknown as OrdersService;
    auditService = {
      getAll: jest.fn(async () => [auditRecord()]),
    } as unknown as AuditService;
    db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('order_archive_manifest')) {
          return {
            rows: [
              {
                order_id: 'DH-1001',
                archive_key: 'warehouse/tenants/default/orders/run=AR-1001.parquet',
                archived_at: new Date('2026-11-23T00:00:00.000Z'),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('archive_runs')) {
          return {
            rows: [
              {
                id: 'AR-1001',
                object_key:
                  'warehouse/tenants/default/orders/run=AR-1001.parquet',
                row_count: 77,
                started_at: new Date('2026-11-23T00:00:00.000Z'),
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as unknown as DbService;
    service = new BiLineageService(
      store,
      ordersService,
      auditService,
      db,
    );
  });

  it('dựng phả hệ từ snapshot, recommendation, order, audit và archive', async () => {
    await store.saveSnapshot(snapshot());
    await store.saveRecommendation(recommendation());
    await store.saveFeedback(feedback());

    const result = await service.latest();

    expect(result.snapshot.id).toBe('SN-1001');
    expect(result.axes).toHaveLength(4);
    expect(result.sources.recommendations[0].id).toBe('DX-1001');
    expect(result.sources.feedback[0].correct).toBe(true);
    expect(result.sources.orders[0]).toMatchObject({
      id: 'DH-1001',
      state: 'Hoàn',
    });
    expect(result.sources.audit[0].action).toBe(
      'order.transition.denied',
    );
    expect(result.sources.archive[0]).toMatchObject({
      orderId: 'DH-1001',
      runId: 'AR-1001',
      rowCount: 77,
    });
    expect(result.coverage.find((item) => item.axis === 'P')).toEqual({
      axis: 'P',
      measured: 2,
      total: 2,
    });
  });

  it('trả 404 khi chưa có snapshot hoặc snapshot không tồn tại', async () => {
    await expect(service.latest()).rejects.toBeInstanceOf(NotFoundException);

    await store.saveSnapshot(snapshot());
    await expect(service.byId('SN-9999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('không trả phone/address/customer name trong response', async () => {
    await store.saveSnapshot(snapshot());
    await store.saveRecommendation(recommendation());

    const result = await service.latest();
    const json = JSON.stringify(result);

    expect(json).not.toContain('0901234567');
    expect(json).not.toContain('Khách hàng');
    expect(json).not.toContain('addressTrust');
  });
});
