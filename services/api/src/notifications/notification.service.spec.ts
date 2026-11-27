// SPDX-License-Identifier: Apache-2.0
import type { DbService } from '../db/db.service';
import { NotificationsService } from './notification.service';

function makeDb() {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ count: 5 }] };
      }
      return {
        rows: [
          {
            id: 9,
            type: 'sla.overdue',
            title: 'Task quá hạn',
            body: 'Đơn DH-1 quá hạn',
            entity_type: 'order',
            entity_id: 'DH-1',
            action_href: '/orders/DH-1',
            audience_role: 'Nhân viên kho',
            audience_user: null,
            read_at: null,
            created_at: '2026-11-27T10:00:00.000Z',
            limit: params?.[0],
            offset: params?.[1],
          },
        ],
      };
    }),
  } as unknown as DbService;
}

describe('NotificationsService listAllPage', () => {
  it('trả items/total/limit/offset cho console admin', async () => {
    const db = makeDb();
    const service = new NotificationsService(db);

    const page = await service.listAllPage(2, 4);

    expect(page).toMatchObject({ total: 5, limit: 2, offset: 4 });
    expect(page.items[0]).toMatchObject({
      id: 9,
      type: 'sla.overdue',
      entityId: 'DH-1',
      audienceRole: 'Nhân viên kho',
    });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('chặn limit sai và offset âm', async () => {
    const service = new NotificationsService(makeDb());

    await expect(service.listAllPage(0, 0)).rejects.toThrow('limit');
    await expect(service.listAllPage(10, -1)).rejects.toThrow('offset');
  });
});
