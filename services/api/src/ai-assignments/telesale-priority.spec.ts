// SPDX-License-Identifier: Apache-2.0
import type { Order } from '../orders/orders.types';
import {
  sortPriorityRows,
  toDisplayRow,
  toPriorityRow,
} from './telesale-priority';

const NOW = Date.parse('2026-11-28T10:00:00+07:00');

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'DH-1001',
    idempotencyKey: 'key-1',
    customer: 'Hộ nước mắm A',
    phone: '0901234567',
    items: [{ sku: 'NM-40', quantity: 1 }],
    total: 142000,
    deadline: null,
    channelId: null,
    customerId: null,
    addressTrust: 100,
    addressLevel: 'Tin cậy cao',
    workflowInstanceId: 'wf-1',
    state: 'Mới tạo',
    history: [],
    createdAt: '2026-11-28T09:00:00.000Z',
    updatedAt: '2026-11-28T09:00:00.000Z',
    ...overrides,
  };
}

describe('toPriorityRow', () => {
  it('đơn quá hạn là ứng viên, lý do quá SLA, ETA quá hạn, etaMinutes -1', () => {
    const row = toPriorityRow(
      makeOrder({ deadline: '2026-11-28T08:00:00+07:00' }),
      NOW,
    );
    expect(row).toMatchObject({
      orderId: 'DH-1001',
      reason: 'Quá SLA giao hẹn',
      suggestion: 'Gọi trước 08:00',
      eta: 'Quá hạn',
      etaMinutes: -1,
    });
  });

  it('đơn sắp quá hạn trong 24 giờ là ứng viên, ETA tính theo mốc giao', () => {
    const row = toPriorityRow(
      makeOrder({ deadline: '2026-11-28T15:30:00+07:00' }),
      NOW,
    );
    expect(row).toMatchObject({
      reason: 'Sắp quá SLA giao hẹn',
      suggestion: 'Gọi trước 15:30',
      eta: '5h30',
      etaMinutes: 330,
    });
  });

  it('đơn tin cậy thấp là ứng viên dù mốc giao còn xa, lý do tin cậy thấp lên trước', () => {
    const row = toPriorityRow(
      makeOrder({
        deadline: '2026-12-05T10:00:00+07:00',
        addressTrust: 40,
      }),
      NOW,
    );
    expect(row).toMatchObject({
      reason: 'Địa chỉ độ tin cậy thấp',
      suggestion: 'Xác nhận địa chỉ',
      etaMinutes: expect.any(Number),
    });
    expect((row as { etaMinutes: number }).etaMinutes).toBeGreaterThan(0);
  });

  it('đơn tin cậy thấp không có mốc giao vẫn là ứng viên, ETA -', () => {
    const row = toPriorityRow(
      makeOrder({ deadline: null, addressTrust: 20 }),
      NOW,
    );
    expect(row).toMatchObject({
      reason: 'Địa chỉ độ tin cậy thấp',
      eta: '-',
      etaMinutes: null,
    });
  });

  it('đơn giá trị cao sắp quá hạn thì lý do là giá trị cao (trước SLA)', () => {
    const row = toPriorityRow(
      makeOrder({
        deadline: '2026-11-28T12:00:00+07:00',
        total: 500000,
      }),
      NOW,
    );
    expect(row).toMatchObject({
      reason: 'Đơn giá trị cao',
      suggestion: 'Xác nhận COD',
    });
  });

  it('đơn mốc giao còn xa và tin cậy đủ thì không phải ứng viên', () => {
    expect(
      toPriorityRow(
        makeOrder({ deadline: '2026-12-05T10:00:00+07:00' }),
        NOW,
      ),
    ).toBeNull();
  });

  it('đơn đã Hoàn hoặc Hủy thì không phải ứng viên', () => {
    expect(
      toPriorityRow(
        makeOrder({
          deadline: '2026-11-28T08:00:00+07:00',
          state: 'Hoàn',
        }),
        NOW,
      ),
    ).toBeNull();
    expect(
      toPriorityRow(
        makeOrder({
          deadline: '2026-11-28T08:00:00+07:00',
          state: 'Hủy',
        }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe('toDisplayRow', () => {
  it('đơn không phải ứng viên vẫn tính được hàng hiển thị (lý do -, gợi ý nhắc nhận hàng)', () => {
    const row = toDisplayRow(
      makeOrder({ deadline: '2026-12-05T10:00:00+07:00' }),
      NOW,
    );
    expect(row).toMatchObject({
      orderId: 'DH-1001',
      reason: '-',
      suggestion: 'Nhắc nhận hàng',
    });
  });
});

describe('sortPriorityRows', () => {
  it('quá hạn lên trước, không có mốc giao xuống cuối', () => {
    const overdue = toPriorityRow(
      makeOrder({ id: 'DH-1', deadline: '2026-11-28T08:00:00+07:00' }),
      NOW,
    ) as NonNullable<ReturnType<typeof toPriorityRow>>;
    const soon = toPriorityRow(
      makeOrder({ id: 'DH-2', deadline: '2026-11-28T12:00:00+07:00' }),
      NOW,
    ) as NonNullable<ReturnType<typeof toPriorityRow>>;
    const noDeadline = toPriorityRow(
      makeOrder({ id: 'DH-3', deadline: null, addressTrust: 20 }),
      NOW,
    ) as NonNullable<ReturnType<typeof toPriorityRow>>;
    const sorted = sortPriorityRows([noDeadline, soon, overdue]);
    expect(sorted.map((row) => row.orderId)).toEqual(['DH-1', 'DH-2', 'DH-3']);
  });
});
