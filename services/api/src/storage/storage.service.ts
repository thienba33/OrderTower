// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import {
  BUSINESS_ROLE,
  isDriverOnly,
} from '../auth/permissions';
import { computeNextNumber } from '../db/id-counter';
import { DbService } from '../db/db.service';
import { ClamAvService } from './clamav.service';
import { FILE_STORE, InMemoryFileStore } from './storage.store';
import type { FileStore } from './storage.types';
import {
  FILE_KINDS,
  type FileFilters,
  type FileKind,
  type StoredFile,
  type UploadFileInput,
} from './storage.types';
import { InMemoryObjectStorage, OBJECT_STORAGE } from './object-storage';
import type { ObjectStorage } from './storage.types';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function copyFile(file: StoredFile): StoredFile {
  return JSON.parse(JSON.stringify(file)) as StoredFile;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private nextNumber = 1001;

  constructor(
    @Optional()
    @Inject(FILE_STORE)
    private readonly store: FileStore = new InMemoryFileStore(),
    @Optional()
    @Inject(OBJECT_STORAGE)
    private readonly objects: ObjectStorage = new InMemoryObjectStorage(),
    @Optional()
    private readonly db?: DbService,
    @Optional()
    private readonly clamav?: ClamAvService,
    @Optional()
    private readonly audit?: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    const files = await this.store.list();
    this.nextNumber = computeNextNumber(
      files.map((file) => file.id),
      'F',
    );
    try {
      await this.objects.ensureBucket();
    } catch (error) {
      this.logger.error(
        `Không chuẩn bị được bucket object storage: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async upload(input: UploadFileInput, caller: Caller): Promise<StoredFile> {
    if (caller.roles.includes(BUSINESS_ROLE.CUSTOMER)) {
      throw new ForbiddenException('Khách hàng không được upload file.');
    }
    if (!FILE_KINDS.includes(input.kind)) {
      throw new BadRequestException(
        `kind phải là một trong: ${FILE_KINDS.join(', ')}.`,
      );
    }
    if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
      throw new BadRequestException('File rỗng hoặc không đọc được.');
    }
    if (input.buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File vượt quá giới hạn ${MAX_FILE_SIZE} byte.`,
      );
    }
    if (!ALLOWED_MIME.has(input.mime)) {
      throw new BadRequestException(
        `MIME ${input.mime} không được phép; chỉ nhận JPEG/PNG/WebP/PDF.`,
      );
    }
    if (
      caller.roles.includes(BUSINESS_ROLE.DRIVER) &&
      isDriverOnly(caller.roles) &&
      input.kind !== 'proof_photo'
    ) {
      throw new ForbiddenException(
        'Tài xế chỉ được upload ảnh bằng chứng giao hàng.',
      );
    }
    const orderId = optionalText(input.orderId);
    if (input.kind === 'proof_photo' && orderId === null) {
      throw new BadRequestException(
        'Ảnh bằng chứng giao hàng cần orderId.',
      );
    }
    if (orderId !== null) {
      await this.assertOrderExists(orderId);
      if (isDriverOnly(caller.roles)) {
        await this.assertDriverOwnsOrder(orderId, caller.username);
      }
    }
    const id = `F-${String(this.nextNumber++).padStart(4, '0')}`;
    const now = new Date().toISOString();
    const objectKey = `files/${input.kind}/${orderId ?? 'general'}/${id}-${safeName(
      input.originalName,
    )}`;
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');
    await this.objects.put(objectKey, input.buffer, input.mime);
    const scan = this.clamav
      ? await this.clamav.scan(input.buffer)
      : { status: 'clean' as const, signature: null, note: 'Không có ClamAV' };
    if (scan.status === 'error' && process.env.CLAMAV_REQUIRED === 'true') {
      await this.objects.delete(objectKey);
      throw new ServiceUnavailableException(
        `Không kiểm dịch được file: ${scan.note}`,
      );
    }
    const file: StoredFile = {
      id,
      ownerId: caller.userId,
      ownerUsername: caller.username,
      orderId,
      kind: input.kind,
      title: optionalText(input.title) ?? input.originalName,
      category: optionalText(input.category),
      objectKey,
      originalName: input.originalName,
      mime: input.mime,
      size: input.buffer.length,
      sha256,
      status: scan.status === 'infected' ? 'infected' : 'clean',
      scanNote: scan.note,
      createdAt: now,
      scannedAt: now,
      deletedAt: null,
      deleteReason: null,
    };
    await this.store.save(file);
    await this.audit?.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'file.uploaded',
      orderId: orderId ?? id,
      from: null,
      to: file.status,
      detail: `${file.kind} ${file.id}, ${file.originalName}, sha256 ${file.sha256}`,
    });
    if (file.status === 'infected') {
      throw new BadRequestException(
        `File chứa mã độc (${scan.signature ?? scan.note}); đã cách ly, không tải được.`,
      );
    }
    return copyFile(file);
  }

  async listForCaller(
    filters: FileFilters,
    caller: Caller,
  ): Promise<StoredFile[]> {
    let files = await this.store.list();
    if (!filters.includeDeleted) {
      files = files.filter((file) => file.status !== 'deleted');
    }
    if (filters.orderId !== undefined) {
      files = files.filter((file) => file.orderId === filters.orderId);
    }
    if (filters.kind !== undefined) {
      files = files.filter((file) => file.kind === filters.kind);
    }
    if (filters.status !== undefined) {
      files = files.filter((file) => file.status === filters.status);
    }
    if (isDriverOnly(caller.roles)) {
      const allowed = await this.allowedOrderIds(caller.username);
      files = files.filter(
        (file) => file.orderId !== null && allowed.has(file.orderId),
      );
    }
    return files.sort((a, b) => a.id.localeCompare(b.id)).map(copyFile);
  }

  async getForCaller(id: string, caller: Caller): Promise<StoredFile> {
    const file = await this.requireFile(id);
    if (isDriverOnly(caller.roles)) {
      const allowed = await this.allowedOrderIds(caller.username);
      if (file.orderId === null || !allowed.has(file.orderId)) {
        throw new ForbiddenException(
          `Tài xế ${caller.username} không được xem file ${id}.`,
        );
      }
    }
    return copyFile(file);
  }

  async contentForCaller(
    id: string,
    caller: Caller,
  ): Promise<{ file: StoredFile; body: Buffer }> {
    const file = await this.getForCaller(id, caller);
    if (file.status === 'deleted') {
      throw new NotFoundException(`File ${id} đã bị xóa.`);
    }
    if (file.status === 'infected') {
      throw new ConflictException(`File ${id} bị cách ly do nhiễm mã độc.`);
    }
    if (file.status !== 'clean') {
      throw new ConflictException(`File ${id} chưa sẵn sàng để tải.`);
    }
    try {
      const object = await this.objects.get(file.objectKey);
      return { file, body: object.body };
    } catch {
      throw new NotFoundException(`Không tìm thấy object của file ${id}.`);
    }
  }

  // ShipmentsService dùng để xác nhận file bằng chứng thuộc đúng đơn và
  // đã sạch trước khi cho giao hàng.
  async getProofPhotoForOrder(
    id: string,
    orderId: string,
  ): Promise<StoredFile> {
    const file = await this.requireFile(id);
    if (file.status !== 'clean') {
      throw new BadRequestException(
        `File ${id} đang ở trạng thái "${file.status}", không dùng làm bằng chứng.`,
      );
    }
    if (file.kind !== 'proof_photo') {
      throw new BadRequestException(`File ${id} không phải ảnh bằng chứng.`);
    }
    if (file.orderId !== orderId) {
      throw new BadRequestException(
        `File ${id} thuộc đơn ${file.orderId ?? '-'}, không phải đơn ${orderId}.`,
      );
    }
    return copyFile(file);
  }

  async delete(
    id: string,
    reason: string,
    caller: Caller,
  ): Promise<StoredFile> {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new BadRequestException('Xóa file cần có lý do.');
    }
    const file = await this.requireFile(id);
    const canDelete =
      file.ownerUsername === caller.username ||
      caller.roles.includes(BUSINESS_ROLE.ADMIN) ||
      caller.roles.includes(BUSINESS_ROLE.MANAGER);
    if (!canDelete) {
      throw new ForbiddenException(
        `Tài khoản ${caller.username} không được xóa file ${id}.`,
      );
    }
    file.status = 'deleted';
    file.deletedAt = new Date().toISOString();
    file.deleteReason = reason.trim();
    await this.store.save(file);
    await this.audit?.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'file.deleted',
      orderId: file.orderId ?? file.id,
      from: 'clean',
      to: 'deleted',
      detail: `Lý do: ${reason.trim()}`,
    });
    return copyFile(file);
  }

  private async requireFile(id: string): Promise<StoredFile> {
    const file = await this.store.findById(id);
    if (!file) {
      throw new NotFoundException(`Không tìm thấy file ${id}.`);
    }
    return file;
  }

  private async assertOrderExists(orderId: string): Promise<void> {
    if (!this.db) {
      return;
    }
    const result = await this.db.query(
      'SELECT 1 FROM orders WHERE id = $1 LIMIT 1',
      [orderId],
    );
    if (result.rows.length === 0) {
      throw new BadRequestException(`Không tìm thấy đơn ${orderId}.`);
    }
  }

  private async assertDriverOwnsOrder(
    orderId: string,
    username: string,
  ): Promise<void> {
    if (!this.db) {
      throw new ConflictException(
        'Chưa nối cơ sở dữ liệu nên không kiểm tra được quyền tài xế.',
      );
    }
    const result = await this.db.query(
      `SELECT 1
         FROM shipments s
         JOIN drivers d ON d.id = s.driver_id
        WHERE s.order_id = $1 AND d.username = $2
        LIMIT 1`,
      [orderId, username],
    );
    if (result.rows.length === 0) {
      throw new ForbiddenException(
        `Tài xế ${username} không được upload file cho đơn ${orderId}.`,
      );
    }
  }

  private async allowedOrderIds(username: string): Promise<Set<string>> {
    if (!this.db) {
      return new Set();
    }
    const result = await this.db.query(
      `SELECT DISTINCT s.order_id
         FROM shipments s
         JOIN drivers d ON d.id = s.driver_id
        WHERE d.username = $1`,
      [username],
    );
    return new Set(
      (result.rows as Array<{ order_id: string }>).map((row) => row.order_id),
    );
  }
}
