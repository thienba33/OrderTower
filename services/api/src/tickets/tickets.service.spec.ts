// SPDX-License-Identifier: Apache-2.0
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { TicketsService, computeTicketKpis } from './tickets.service';
import { InMemoryTicketStore } from './tickets.store';
import type { CreateTicketInput, Ticket } from './tickets.types';

const CSKH: Caller = {
  userId: 'cskh-1',
  username: 'demo.customer-service',
  roles: ['Nhân viên chăm sóc khách hàng'],
};
const MANAGER: Caller = {
  userId: 'manager-1',
  username: 'demo.manager',
  roles: ['Quản lý'],
};
const DISPATCHER: Caller = {
  userId: 'dispatcher-1',
  username: 'demo.dispatcher',
  roles: ['Điều phối viên'],
};

async function buildService(): Promise<TicketsService> {
  const audit = new AuditService();
  const service = new TicketsService(audit);
  await service.onModuleInit();
  return service;
}

async function buildServiceWithEmptyStore(): Promise<TicketsService> {
  const audit = new AuditService();
  const service = new TicketsService(audit, new InMemoryTicketStore());
  return service;
}

function createInput(overrides: Partial<CreateTicketInput> = {}): CreateTicketInput {
  return {
    customer: 'KH-100',
    orderId: 'DH-2001',
    type: 'Hỏi sản phẩm',
    channel: 'Chat',
    content: 'Hỏi giá sỉ 10 chai NM-25.',
    ...overrides,
  };
}

describe('TicketsService', () => {
  it('seed nạp đủ 14 dòng mẫu đóng băng khi bảng còn trống', async () => {
    const service = await buildService();
    const tickets = await service.list();
    expect(tickets).toHaveLength(14);
    const ids = tickets.map((ticket) => ticket.id).sort();
    expect(ids[0]).toBe('YC-018');
    expect(ids[13]).toBe('YC-031');
  });

  it('lọc đúng 4 trạng thái: Mới 4, Đang xử lý 4, Chờ khách 3, Đã đóng 3', async () => {
    const service = await buildService();
    expect((await service.list({ status: 'Mới' })).length).toBe(4);
    expect((await service.list({ status: 'Đang xử lý' })).length).toBe(4);
    expect((await service.list({ status: 'Chờ khách' })).length).toBe(3);
    expect((await service.list({ status: 'Đã đóng' })).length).toBe(3);
  });

  it('lọc theo loại và kênh: Giao trễ 4 dòng, Chat 6 dòng', async () => {
    const service = await buildService();
    expect((await service.list({ type: 'Giao trễ' })).length).toBe(4);
    expect((await service.list({ channel: 'Chat' })).length).toBe(6);
  });

  it('nhóm "chưa gọi lại" có đúng 6 dòng mẫu', async () => {
    const service = await buildService();
    const pending = await service.list({ needsCall: true });
    expect(pending).toHaveLength(6);
    expect(pending.map((ticket) => ticket.id).sort()).toEqual([
      'YC-019',
      'YC-022',
      'YC-024',
      'YC-025',
      'YC-030',
      'YC-031',
    ]);
  });

  it('tìm kiếm theo mã đơn, mã khách và mã ticket', async () => {
    const service = await buildService();
    expect((await service.list({ q: 'DH-1044' })).map((t) => t.id)).toEqual([
      'YC-031',
    ]);
    expect((await service.list({ q: 'kh-058' })).map((t) => t.id)).toEqual([
      'YC-030',
    ]);
    expect((await service.list({ q: 'yc-018' })).map((t) => t.id)).toEqual([
      'YC-018',
    ]);
  });

  it('tạo ticket mới: trạng thái Mới, người xử lý Chưa gán, mã tiếp theo YC-1001', async () => {
    const service = await buildService();
    const ticket = await service.create(createInput(), CSKH);
    expect(ticket.id).toBe('YC-1001');
    expect(ticket.status).toBe('Mới');
    expect(ticket.handler).toBe('Chưa gán');
    expect(ticket.createdBy).toBe('demo.customer-service');
    expect(ticket.closedAt).toBeNull();
    expect((await service.list()).length).toBe(15);
  });

  it('tạo ticket loại Giao trễ thì mặc định vào nhóm chưa gọi lại', async () => {
    const service = await buildService();
    const late = await service.create(
      createInput({ type: 'Giao trễ' }),
      CSKH,
    );
    expect(late.needsCall).toBe(true);
    const asking = await service.create(createInput(), CSKH);
    expect(asking.needsCall).toBe(false);
    const noted = await service.create(
      createInput({ needsCall: true }),
      CSKH,
    );
    expect(noted.needsCall).toBe(true);
  });

  it('tạo ticket sai vai (Điều phối viên) thì báo 409', async () => {
    const service = await buildService();
    await expect(
      service.create(createInput(), DISPATCHER),
    ).rejects.toThrow('Tạo ticket cần vai');
  });

  it('tạo ticket thiếu nội dung hoặc sai loại thì báo 400', async () => {
    const service = await buildService();
    await expect(
      service.create(createInput({ content: '   ' }), CSKH),
    ).rejects.toThrow('Tạo ticket cần có nội dung.');
    await expect(
      service.create(
        createInput({ type: 'Loại lạ' as CreateTicketInput['type'] }),
        CSKH,
      ),
    ).rejects.toThrow('Loại ticket phải là 1 trong');
  });

  it('đổi trạng thái xuôi từng bước: Mới -> Đang xử lý -> Chờ khách -> Đã đóng', async () => {
    const service = await buildService();
    const created = await service.create(createInput(), CSKH);
    const step1 = await service.changeStatus(
      created.id,
      { status: 'Đang xử lý' },
      CSKH,
    );
    expect(step1.status).toBe('Đang xử lý');
    expect(step1.closedAt).toBeNull();
    const step2 = await service.changeStatus(
      created.id,
      { status: 'Chờ khách' },
      MANAGER,
    );
    expect(step2.status).toBe('Chờ khách');
    const step3 = await service.changeStatus(
      created.id,
      { status: 'Đã đóng' },
      CSKH,
    );
    expect(step3.status).toBe('Đã đóng');
    expect(step3.closedAt).not.toBeNull();
  });

  it('đổi trạng thái nhảy cóc (Mới -> Đã đóng) thì báo 409', async () => {
    const service = await buildService();
    const created = await service.create(createInput(), CSKH);
    await expect(
      service.changeStatus(created.id, { status: 'Đã đóng' }, CSKH),
    ).rejects.toThrow('chỉ đổi sang "Đang xử lý"');
  });

  it('đổi trạng thái sai vai (Điều phối viên) thì báo 409', async () => {
    const service = await buildService();
    const created = await service.create(createInput(), CSKH);
    await expect(
      service.changeStatus(created.id, { status: 'Đang xử lý' }, DISPATCHER),
    ).rejects.toThrow('Đổi trạng thái ticket cần vai');
  });

  it('ticket đã đóng thì không đổi trạng thái nữa', async () => {
    const service = await buildService();
    const created = await service.create(createInput(), CSKH);
    await service.changeStatus(created.id, { status: 'Đang xử lý' }, CSKH);
    await service.changeStatus(created.id, { status: 'Chờ khách' }, CSKH);
    await service.changeStatus(created.id, { status: 'Đã đóng' }, CSKH);
    await expect(
      service.changeStatus(created.id, { status: 'Chờ khách' }, CSKH),
    ).rejects.toThrow('đã ở trạng thái "Đã đóng"');
  });

  it('đổi trạng thái ticket không có thì báo 404', async () => {
    const service = await buildService();
    await expect(
      service.changeStatus('YC-9999', { status: 'Đang xử lý' }, CSKH),
    ).rejects.toThrow('Không tìm thấy ticket YC-9999.');
  });

  it('KPI khớp với bảng mẫu: Mới 4, Đang xử lý 4, Chờ khách 3, Đã đóng hôm nay 0', async () => {
    const service = await buildService();
    // 3 dòng mẫu "Đã đóng" đóng ngày 02/11/2026, không phải hôm nay.
    expect(await service.kpis()).toEqual({
      newRequests: 4,
      inProgress: 4,
      waitingCustomer: 3,
      closedToday: 0,
    });
  });

  it('đóng 1 ticket hôm nay thì KPI Đã đóng hôm nay tăng lên 1', async () => {
    const service = await buildService();
    const created = await service.create(createInput(), CSKH);
    await service.changeStatus(created.id, { status: 'Đang xử lý' }, CSKH);
    await service.changeStatus(created.id, { status: 'Chờ khách' }, CSKH);
    await service.changeStatus(created.id, { status: 'Đã đóng' }, CSKH);
    const kpis = await service.kpis();
    expect(kpis.closedToday).toBe(1);
    expect(kpis.newRequests).toBe(4);
  });

  it('computeTicketKpis đếm Đã đóng hôm nay theo giờ Việt Nam', () => {
    const closedAt = new Date('2026-11-24T10:00:00+07:00').toISOString();
    const ticket = {
      id: 'YC-0001',
      customer: 'KH-001',
      orderId: 'DH-1001',
      type: 'Giao trễ',
      channel: 'Chat',
      content: 'Hỏi mốc giao.',
      status: 'Đã đóng',
      handler: 'Mai',
      needsCall: false,
      createdBy: 'seed',
      createdAt: closedAt,
      updatedAt: closedAt,
      closedAt,
    } as Ticket;
    const sameDay = new Date('2026-11-24T23:30:00+07:00');
    expect(computeTicketKpis([ticket], sameDay).closedToday).toBe(1);
    // 00:30 giờ Việt Nam ngày hôm sau: đã sang ngày mới.
    const nextDay = new Date('2026-11-25T00:30:00+07:00');
    expect(computeTicketKpis([ticket], nextDay).closedToday).toBe(0);
  });

  it('khởi động lại khi kho đã có dữ liệu thì không nạp seed lại', async () => {
    const service = await buildService();
    await service.create(createInput(), CSKH);
    await service.onModuleInit();
    expect((await service.list()).length).toBe(15);
    const second = await service.create(createInput(), CSKH);
    expect(second.id).toBe('YC-1002');
  });

  it('tệp seed sai thì chặn khởi động', async () => {
    const service = await buildServiceWithEmptyStore();
    process.env.TICKETS_SEED_PATH = '/tmp/khong-co-tep-seed-ticket.json';
    try {
      await expect(service.onModuleInit()).rejects.toThrow(
        'Không đọc được tệp seed ticket',
      );
    } finally {
      delete process.env.TICKETS_SEED_PATH;
    }
  });
});
