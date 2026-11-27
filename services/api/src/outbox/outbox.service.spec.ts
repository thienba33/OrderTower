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

  it('event lỗi retry có backoff rồi dead-letter và requeue được', async () => {
    const store = new InMemoryOutboxStore();
    const stored = await store.append(event('DH-2001'));

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(store.markFailed(stored.id, 'broker down')).resolves.toBe(
        'retry',
      );
    }
    await expect(store.markFailed(stored.id, 'broker down')).resolves.toBe(
      'dead-letter',
    );
    expect(await store.list({ status: 'failed' })).toHaveLength(1);
    expect(await store.requeue(stored.id)).toBe(true);
    const requeued = await store.findById(stored.id);
    expect(requeued).toMatchObject({ status: 'pending', attempts: 0 });
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
