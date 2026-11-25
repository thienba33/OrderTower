// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Caller } from '../auth/auth.types';
import { ClamAvService } from './clamav.service';
import { InMemoryObjectStorage } from './object-storage';
import { StorageService } from './storage.service';
import { InMemoryFileStore } from './storage.store';

function caller(username: string, roles: string[]): Caller {
  return { userId: `u-${username}`, username, roles };
}

function buildServices(scanStatus: 'clean' | 'infected' | 'error' = 'clean') {
  const store = new InMemoryFileStore();
  const objects = new InMemoryObjectStorage();
  const clamav = {
    scan: async () => ({
      status: scanStatus,
      signature: scanStatus === 'infected' ? 'Eicar-Test-Signature' : null,
      note: scanStatus,
    }),
  } as unknown as ClamAvService;
  const service = new StorageService(store, objects, undefined, clamav);
  return { service, store, objects };
}

const DISPATCHER = caller('dieu-phoi', ['Điều phối viên']);
const DRIVER = caller('tai-xe', ['Tài xế']);
const IMAGE = Buffer.from('fake-jpeg-content');

describe('StorageService', () => {
  it('upload file hợp lệ, lưu metadata + hash, tải lại được', async () => {
    const { service } = buildServices();
    const file = await service.upload(
      {
        buffer: IMAGE,
        originalName: 'anh-giao.jpg',
        mime: 'image/jpeg',
        size: IMAGE.length,
        kind: 'proof_photo',
        orderId: 'DH-1001',
      },
      DISPATCHER,
    );
    expect(file.id).toMatch(/^F-/);
    expect(file.status).toBe('clean');
    expect(file.sha256).toHaveLength(64);
    expect(file.objectKey).toContain('proof_photo');
    const content = await service.contentForCaller(file.id, DISPATCHER);
    expect(content.body.equals(IMAGE)).toBe(true);
  });

  it('từ chối MIME không được phép', async () => {
    const { service } = buildServices();
    await expect(
      service.upload(
        {
          buffer: IMAGE,
          originalName: 'a.exe',
          mime: 'application/x-msdownload',
          size: IMAGE.length,
          kind: 'attachment',
        },
        DISPATCHER,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('file nhiễm bị đánh dấu infected và không tải được', async () => {
    const { service, store } = buildServices('infected');
    await expect(
      service.upload(
        {
          buffer: Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'),
          originalName: 'eicar.jpg',
          mime: 'image/jpeg',
          size: 20,
          kind: 'proof_photo',
          orderId: 'DH-1001',
        },
        DISPATCHER,
      ),
    ).rejects.toThrow(BadRequestException);
    const files = await store.list();
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('infected');
    await expect(
      service.contentForCaller(files[0].id, DISPATCHER),
    ).rejects.toThrow();
  });

  it('proof photo phải đúng đơn', async () => {
    const { service } = buildServices();
    const file = await service.upload(
      {
        buffer: IMAGE,
        originalName: 'anh.jpg',
        mime: 'image/jpeg',
        size: IMAGE.length,
        kind: 'proof_photo',
        orderId: 'DH-1001',
      },
      DISPATCHER,
    );
    await expect(
      service.getProofPhotoForOrder(file.id, 'DH-1002'),
    ).rejects.toThrow(BadRequestException);
  });

  it('customer không được upload', async () => {
    const { service } = buildServices();
    await expect(
      service.upload(
        {
          buffer: IMAGE,
          originalName: 'anh.jpg',
          mime: 'image/jpeg',
          size: IMAGE.length,
          kind: 'proof_photo',
          orderId: 'DH-1001',
        },
        caller('khach', ['Khách hàng mô phỏng']),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('tài xế chỉ upload được proof_photo', async () => {
    const { service } = buildServices();
    await expect(
      service.upload(
        {
          buffer: IMAGE,
          originalName: 'tai-lieu.pdf',
          mime: 'application/pdf',
          size: IMAGE.length,
          kind: 'document',
        },
        DRIVER,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('chỉ chủ file hoặc manager/admin được xóa', async () => {
    const { service } = buildServices();
    const file = await service.upload(
      {
        buffer: IMAGE,
        originalName: 'anh.jpg',
        mime: 'image/jpeg',
        size: IMAGE.length,
        kind: 'proof_photo',
        orderId: 'DH-1001',
      },
      DISPATCHER,
    );
    await expect(
      service.delete(file.id, 'sai', caller('khac', ['Điều phối viên'])),
    ).rejects.toThrow(ForbiddenException);
    const deleted = await service.delete(file.id, 'đổi ảnh', DISPATCHER);
    expect(deleted.status).toBe('deleted');
  });
});
