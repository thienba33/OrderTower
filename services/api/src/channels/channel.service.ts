// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import { InMemoryChannelStore, CHANNEL_STORE } from './channel.store';
import type {
  Channel,
  ChannelSeedItem,
  ChannelStatus,
  ChannelStore,
  CreateChannelInput,
} from './channel.types';

const DISPATCHER_ROLE = 'Điều phối viên';

// Tên tệp seed mặc định. Đổi tệp seed rồi khởi động lại thì kho mới có hiệu lực.
const DEFAULT_SEED_FILE = 'channels.seed.json';

function copyChannel(channel: Channel): Channel {
  return JSON.parse(JSON.stringify(channel)) as Channel;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value;
}

function requireRole(caller: Caller, role: string, action: string): void {
  if (!caller.roles.includes(role)) {
    throw new ConflictException(`${action} cần vai ${role}.`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Chuỗi tùy chọn: cắt khoảng trắng 2 đầu, rỗng thì về null để không lưu
// chuỗi toàn khoảng trắng vào kho.
function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Quản lý kênh bán: tạo, tạm dừng, kích hoạt lại, nạp 3 kênh mẫu lúc
// khởi động khi kho còn trống. Người gọi lấy từ token Keycloak, không nhận
// actor/role từ body.
@Injectable()
export class ChannelsService implements OnModuleInit {
  private readonly logger = new Logger(ChannelsService.name);
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(CHANNEL_STORE)
    private readonly store: ChannelStore = new InMemoryChannelStore(),
  ) {}

  // Nạp seed trước rồi mới tính số thứ tự: kho trống thì 3 kênh mẫu nhận
  // K-1001, K-1002, K-1003 theo thứ tự trong tệp seed, kênh tạo tay tiếp
  // theo là K-1004; kho đã có dữ liệu thì giữ nguyên, không nạp lại.
  async onModuleInit(): Promise<void> {
    // Đọc và kiểm tra seed trước: tệp seed sai vẫn chặn khởi động, dù kho
    // đã có dữ liệu.
    const seed = this.loadSeed();
    const existing = await this.store.list();
    if (existing.length > 0) {
      this.logger.log(
        `Kho đã có ${existing.length} kênh trong DB, giữ nguyên dữ liệu.`,
      );
    } else {
      const now = new Date().toISOString();
      for (let index = 0; index < seed.length; index++) {
        const item = seed[index];
        const channel: Channel = {
          id: `K-${String(1001 + index).padStart(4, '0')}`,
          name: item.name,
          description: item.description,
          status: 'Hoạt động',
          createdAt: now,
          updatedAt: now,
        };
        await this.store.save(channel);
      }
      this.logger.log(`Đã nạp ${seed.length} kênh từ tệp seed.`);
    }
    const channels = await this.store.list();
    this.nextNumber = computeNextNumber(
      channels.map((channel) => channel.id),
      'K',
    );
  }

  resolveSeedPath(): string {
    if (process.env.CHANNELS_SEED_PATH) {
      return process.env.CHANNELS_SEED_PATH;
    }
    return join(__dirname, 'data', DEFAULT_SEED_FILE);
  }

  async create(
    input: CreateChannelInput,
    caller: Caller,
  ): Promise<Channel> {
    const name = requireNonEmpty(
      input.name,
      'Tạo kênh cần có tên.',
    ).trim();
    const description = optionalText(input.description);
    requireRole(caller, DISPATCHER_ROLE, 'Tạo kênh');
    // Tên trùng là 409, không ghi audit vì đây là lỗi lúc tạo, giống đơn
    // trùng idempotencyKey ở OrdersService và tạo shipment sai.
    const existing = await this.store.findByName(name);
    if (existing) {
      throw new ConflictException(
        `Tên kênh ${name} đã có kênh ${existing.id}.`,
      );
    }
    const now = new Date().toISOString();
    const channel: Channel = {
      id: `K-${String(this.nextNumber++).padStart(4, '0')}`,
      name,
      description,
      status: 'Hoạt động',
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(channel);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'channel.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: channel.id,
      from: null,
      to: 'Hoạt động',
      detail:
        `Tên ${name}.` +
        (description ? ` Mô tả: ${description}.` : ''),
    });
    return copyChannel(channel);
  }

  async get(id: string): Promise<Channel> {
    const channel = await this.findById(id);
    if (!channel) {
      throw new NotFoundException(`Không tìm thấy kênh ${id}.`);
    }
    return channel;
  }

  // Tìm kênh không ném lỗi: đơn dùng để kiểm tra kênh có thật và đang
  // hoạt động, kênh không có thì chặn 409 fail-closed thay vì 404.
  async findById(id: string): Promise<Channel | null> {
    const channel = await this.store.findById(id);
    return channel ? copyChannel(channel) : null;
  }

  // Tìm kênh theo tên, không ném lỗi.
  async findByName(name: string): Promise<Channel | null> {
    const channel = await this.store.findByName(name);
    return channel ? copyChannel(channel) : null;
  }

  async list(
    filters: {
      status?: ChannelStatus;
    } = {},
  ): Promise<Channel[]> {
    const channels = await this.store.list();
    return channels.filter(
      (channel) =>
        filters.status === undefined || channel.status === filters.status,
    );
  }

  async pause(id: string, caller: Caller): Promise<Channel> {
    return this.changeStatus(
      id,
      'Hoạt động',
      'Tạm dừng',
      caller,
      'Tạm dừng kênh',
      'channel.paused',
    );
  }

  async activate(id: string, caller: Caller): Promise<Channel> {
    return this.changeStatus(
      id,
      'Tạm dừng',
      'Hoạt động',
      caller,
      'Kích hoạt lại kênh',
      'channel.activated',
    );
  }

  private async changeStatus(
    id: string,
    from: ChannelStatus,
    to: ChannelStatus,
    caller: Caller,
    action: string,
    auditAction: string,
  ): Promise<Channel> {
    const channel = await this.get(id);
    // Kiểm trạng thái trước, kiểm vai sau, giống thứ tự ở dispatch của
    // shipment. Sai trạng thái là 409, không ghi audit denied riêng: các
    // action audit của kênh chỉ có created, paused và activated.
    if (channel.status !== from) {
      throw new ConflictException(
        `Kênh ${id} đang ở trạng thái "${channel.status}", chỉ ${action.toLowerCase()} khi kênh ở "${from}".`,
      );
    }
    requireRole(caller, DISPATCHER_ROLE, action);
    const now = new Date().toISOString();
    channel.status = to;
    channel.updatedAt = now;
    await this.store.save(channel);
    await this.audit.append({
      actor: caller.username,
      role: DISPATCHER_ROLE,
      action: auditAction,
      orderId: channel.id,
      from,
      to,
      detail: `Tên ${channel.name}.`,
    });
    return copyChannel(channel);
  }

  private loadSeed(): ChannelSeedItem[] {
    const path = this.resolveSeedPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp seed kênh tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp seed kênh tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`Tệp seed kênh tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`);
    }
    const items = (parsed as Record<string, unknown>).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`Tệp seed kênh tại ${path} không hợp lệ: items phải là mảng không rỗng.`);
    }
    const seen = new Set<string>();
    for (const item of items as unknown[]) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Tệp seed kênh tại ${path} không hợp lệ: mỗi item phải là 1 object.`);
      }
      const entry = item as Record<string, unknown>;
      if (!isNonEmptyString(entry.name)) {
        throw new Error(`Tệp seed kênh tại ${path} không hợp lệ: mỗi item cần name dạng chuỗi.`);
      }
      if (
        entry.description !== undefined &&
        typeof entry.description !== 'string'
      ) {
        throw new Error(`Tệp seed kênh tại ${path} không hợp lệ: description của ${String(entry.name)} phải là dạng chuỗi khi có.`);
      }
      if (seen.has(entry.name as string)) {
        throw new Error(`Tệp seed kênh tại ${path} không hợp lệ: tên kênh ${String(entry.name)} bị trùng.`);
      }
      seen.add(entry.name as string);
    }
    return items as ChannelSeedItem[];
  }
}
