// SPDX-License-Identifier: Apache-2.0
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { ChannelsService } from './channel.service';
import { InMemoryChannelStore } from './channel.store';

const COORDINATOR: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};
const DRIVER: Caller = {
  userId: 'user-nam',
  username: 'nam',
  roles: ['Tài xế'],
};

async function buildServices(): Promise<{
  audit: AuditService;
  channels: ChannelsService;
}> {
  const audit = new AuditService();
  const channels = new ChannelsService(audit, new InMemoryChannelStore());
  await channels.onModuleInit();
  return { audit, channels };
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

describe('ChannelsService', () => {
  it('nạp seed 3 kênh mẫu K-1001..K-1003, không ghi audit', async () => {
    const { audit, channels } = await buildServices();
    const list = await channels.list();
    expect(list.map((channel) => channel.id)).toEqual([
      'K-1001',
      'K-1002',
      'K-1003',
    ]);
    expect(list.map((channel) => channel.name)).toEqual([
      'Chat',
      'Web',
      'Điện thoại',
    ]);
    expect(list.map((channel) => channel.status)).toEqual([
      'Hoạt động',
      'Hoạt động',
      'Hoạt động',
    ]);
    expect(list[0].description).toBe('Đơn về qua tin nhắn chat với khách.');
    expect(await audit.getAll()).toHaveLength(0);
  });

  it('khởi động lại không nạp seed lại', async () => {
    const { channels } = await buildServices();
    await channels.onModuleInit();
    expect(await channels.list()).toHaveLength(3);
    expect((await channels.list()).map((channel) => channel.id)).toEqual([
      'K-1001',
      'K-1002',
      'K-1003',
    ]);
  });

  it('tạo kênh ở trạng thái Hoạt động, ghi audit channel.created', async () => {
    const { audit, channels } = await buildServices();
    const channel = await channels.create(
      { name: 'Sàn thương mại', description: 'Đơn về qua sàn.' },
      COORDINATOR,
    );
    expect(channel.id).toBe('K-1004');
    expect(channel.name).toBe('Sàn thương mại');
    expect(channel.description).toBe('Đơn về qua sàn.');
    expect(channel.status).toBe('Hoạt động');
    expect(await actionCount(audit, 'channel.created')).toBe(1);
    const created = (await audit.getAll()).find(
      (record) => record.action === 'channel.created',
    );
    expect(created).toMatchObject({
      actor: 'son',
      orderId: 'K-1004',
      from: null,
      to: 'Hoạt động',
    });
  });

  it('tạo kênh không mô tả thì description null', async () => {
    const { channels } = await buildServices();
    const channel = await channels.create({ name: 'Sàn thương mại' }, COORDINATOR);
    expect(channel.id).toBe('K-1004');
    expect(channel.description).toBeNull();
  });

  it('tạo kênh thiếu tên thì báo 400', async () => {
    const { channels } = await buildServices();
    await expect(
      channels.create({ name: '  ' }, COORDINATOR),
    ).rejects.toThrow('Tạo kênh cần có tên');
    expect(await channels.list()).toHaveLength(3);
  });

  it('tạo kênh trùng tên thì báo 409, không ghi audit', async () => {
    const { audit, channels } = await buildServices();
    await expect(
      channels.create({ name: 'Chat' }, COORDINATOR),
    ).rejects.toThrow('Tên kênh Chat đã có kênh K-1001');
    expect(await channels.list()).toHaveLength(3);
    expect(await actionCount(audit, 'channel.created')).toBe(0);
  });

  it('tạo kênh bởi Tài xế thì báo 409', async () => {
    const { channels } = await buildServices();
    await expect(
      channels.create({ name: 'Sàn thương mại' }, DRIVER),
    ).rejects.toThrow('cần vai Điều phối viên');
    expect(await channels.list()).toHaveLength(3);
  });

  it('get không tìm thấy thì 404, list lọc theo trạng thái, findByName', async () => {
    const { channels } = await buildServices();
    await expect(channels.get('K-9999')).rejects.toThrow(
      'Không tìm thấy kênh K-9999',
    );
    expect(await channels.findById('K-9999')).toBeNull();
    expect(await channels.findByName('Web')).toMatchObject({ id: 'K-1002' });
    expect(await channels.findByName('Không có')).toBeNull();
    expect(await channels.list()).toHaveLength(3);
    expect(
      await channels.list({ status: 'Hoạt động' }),
    ).toHaveLength(3);
    expect(
      await channels.list({ status: 'Tạm dừng' }),
    ).toHaveLength(0);
    await channels.pause('K-1002', COORDINATOR);
    expect(
      await channels.list({ status: 'Tạm dừng' }),
    ).toHaveLength(1);
  });

  it('tạm dừng rồi kích hoạt lại, ghi audit channel.paused và channel.activated', async () => {
    const { audit, channels } = await buildServices();
    const paused = await channels.pause('K-1001', COORDINATOR);
    expect(paused.status).toBe('Tạm dừng');
    expect(await actionCount(audit, 'channel.paused')).toBe(1);
    const activated = await channels.activate('K-1001', COORDINATOR);
    expect(activated.status).toBe('Hoạt động');
    expect(await actionCount(audit, 'channel.activated')).toBe(1);
    const record = (await audit.getAll()).find(
      (item) => item.action === 'channel.activated',
    );
    expect(record).toMatchObject({
      actor: 'son',
      orderId: 'K-1001',
      from: 'Tạm dừng',
      to: 'Hoạt động',
    });
  });

  it('tạm dừng kênh đã tạm dừng hoặc kích hoạt kênh đang hoạt động thì báo 409', async () => {
    const { channels } = await buildServices();
    await channels.pause('K-1001', COORDINATOR);
    await expect(channels.pause('K-1001', COORDINATOR)).rejects.toThrow(
      'chỉ tạm dừng kênh khi kênh ở "Hoạt động"',
    );
    await expect(channels.activate('K-1002', COORDINATOR)).rejects.toThrow(
      'chỉ kích hoạt lại kênh khi kênh ở "Tạm dừng"',
    );
  });

  it('tạm dừng hoặc kích hoạt bởi Tài xế thì báo 409', async () => {
    const { channels } = await buildServices();
    await expect(channels.pause('K-1001', DRIVER)).rejects.toThrow(
      'cần vai Điều phối viên',
    );
    await channels.pause('K-1001', COORDINATOR);
    await expect(channels.activate('K-1001', DRIVER)).rejects.toThrow(
      'cần vai Điều phối viên',
    );
  });
});
