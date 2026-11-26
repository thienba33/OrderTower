// SPDX-License-Identifier: Apache-2.0
import { InMemoryOutboxStore } from './outbox.store';
import { OutboxService } from './outbox.service';

function event(aggregateId: string, type = 'order.created') {
  return {
    type,
    aggregateType: 'order',
    aggregateId,
    payload: { orderId: aggregateId },
  };
}

describe('OutboxService', () => {
  it('ghi, lọc và relay event idempotent', async () => {
    const service = new OutboxService(new InMemoryOutboxStore());
    await service.append(event('DH-1001'));
    await service.append(event('DH-1001', 'order.transitioned'));
    await service.append(event('DH-1002'));

    expect((await service.list({})).map((item) => item.id)).toEqual([1, 2, 3]);
    expect((await service.list({ type: 'order.created' }))).toHaveLength(2);
    expect((await service.list({ limit: 1 }))).toHaveLength(1);

    const first = await service.relay();
    expect(first).toMatchObject({ processed: 3, failed: 0 });
    expect(await service.list({ status: 'pending' })).toHaveLength(0);
    expect((await service.relay()).processed).toBe(0);
  });

  it('từ chối event thiếu trường hoặc limit sai', async () => {
    const service = new OutboxService(new InMemoryOutboxStore());
    await expect(
      service.append({
        type: '',
        aggregateType: 'order',
        aggregateId: 'DH-1',
        payload: {},
      }),
    ).rejects.toThrow('type');
    await expect(
      service.append({
        type: 'order.created',
        aggregateType: 'order',
        aggregateId: 'DH-1',
        payload: [],
      } as unknown as Parameters<OutboxService['append']>[0]),
    ).rejects.toThrow('payload');
    await expect(service.list({ limit: 0 })).rejects.toThrow('limit');
  });
});
