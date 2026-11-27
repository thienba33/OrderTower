// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { IdSequenceService } from '../db/id-sequence';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/orders.types';
import { InMemoryObjectStorage } from '../storage/object-storage';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ArchiveService } from './archive.service';
import { InMemoryArchiveStore } from './archive.store';

function order(
  id: string,
  state: string,
  updatedAt: string,
  total: number,
  channelId: string,
): Order {
  return {
    id,
    idempotencyKey: `idem-${id}`,
    customer: 'Khách hàng',
    phone: null,
    items: [{ sku: 'NM-25', quantity: 2 }],
    total,
    deadline: null,
    channelId,
    customerId: null,
    addressTrust: null,
    addressLevel: null,
    workflowInstanceId: `WF-${id}`,
    state,
    history: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const caller: Caller = {
  userId: 'u-1',
  username: 'demo.admin',
  roles: ['Quản trị viên'],
};

class FailingObjectStorage extends InMemoryObjectStorage {
  async put(): Promise<void> {
    throw new Error('S3 down');
  }
}

describe('ArchiveService', () => {
  let orders: Order[];
  let ordersService: OrdersService;
  let store: InMemoryArchiveStore;
  let objects: InMemoryObjectStorage;
  let audit: AuditService;
  let service: ArchiveService;

  beforeEach(() => {
    orders = [];
    ordersService = {
      list: jest.fn(async () => orders),
    } as unknown as OrdersService;
    store = new InMemoryArchiveStore();
    objects = new InMemoryObjectStorage();
    audit = new AuditService();
    service = new ArchiveService(
      ordersService,
      store,
      new IdSequenceService(),
      new TenantContextService(),
      objects,
      audit,
    );
  });

  it('archive đơn đã đóng ra Parquet, ghi run + manifest và không trùng', async () => {
    orders = [
      order('DH-1001', 'Hoàn', daysAgo(2), 100000, 'C1'),
      order('DH-1002', 'Đã giao', daysAgo(3), 200000, 'C2'),
      order('DH-1003', 'Đang giao', daysAgo(4), 300000, 'C1'),
    ];

    const result = await service.run({ olderThanDays: 0 }, caller);

    expect(result.archived).toBe(2);
    expect(result.run).toMatchObject({
      dataset: 'orders',
      rowCount: 2,
      status: 'completed',
    });
    expect(result.run?.objectKey).toContain('/orders/');
    expect(result.run?.bytes).toBeGreaterThan(0);
    expect(await store.countArchived()).toBe(2);

    const stored = await objects.get(result.run?.objectKey ?? '');
    expect(stored.body.length).toBe(result.run?.bytes);

    const again = await service.run({ olderThanDays: 0 }, caller);
    expect(again.archived).toBe(0);
    expect(again.run).toBeNull();
  });

  it('tôn trọng ngưỡng olderThanDays', async () => {
    orders = [order('DH-1001', 'Hủy', daysAgo(10), 50000, 'C1')];

    const oldEnough = await service.run({ olderThanDays: 30 }, caller);
    expect(oldEnough.archived).toBe(0);

    const allClosed = await service.run({ olderThanDays: 0 }, caller);
    expect(allClosed.archived).toBe(1);
  });

  it('analytics đọc Parquet và tổng hợp theo state/channel', async () => {
    orders = [
      order('DH-1001', 'Hoàn', daysAgo(2), 100000, 'C1'),
      order('DH-1002', 'Đã giao', daysAgo(3), 200000, 'C2'),
    ];
    await service.run({ olderThanDays: 0 }, caller);

    const all = await service.analytics({});
    expect(all.source).toBe('parquet');
    expect(all.rows).toBe(2);
    expect(all.totalRevenue).toBe(300000);
    expect(all.byState.find((item) => item.key === 'Hoàn')).toMatchObject({
      count: 1,
      revenue: 100000,
    });

    const channel = await service.analytics({ channelId: 'C1' });
    expect(channel.rows).toBe(1);
    expect(channel.totalRevenue).toBe(100000);
  });

  it('từ chối tham số không hợp lệ', async () => {
    await expect(
      service.run({ olderThanDays: -1 }, caller),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.analytics({ from: '2026-13-99' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ghi run failed khi object storage lỗi', async () => {
    orders = [order('DH-1001', 'Hoàn', daysAgo(1), 100000, 'C1')];
    const failing = new FailingObjectStorage();
    const failingService = new ArchiveService(
      ordersService,
      store,
      new IdSequenceService(),
      new TenantContextService(),
      failing,
      audit,
    );

    await expect(
      failingService.run({ olderThanDays: 0 }, caller),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const runs = await store.listRuns(10);
    expect(runs[0].status).toBe('failed');
    expect(runs[0].error).toContain('S3 down');
  });
});
