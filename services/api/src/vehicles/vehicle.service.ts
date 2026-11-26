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
import { InMemoryVehicleStore, VEHICLE_STORE } from './vehicle.store';
import type {
  CreateVehicleInput,
  Vehicle,
  VehicleSeedItem,
  VehicleStatus,
  VehicleStore,
} from './vehicle.types';

const DISPATCHER_ROLE = 'Điều phối viên';

// Tên tệp seed mặc định. Đổi tệp seed rồi khởi động lại thì xe mới có hiệu lực.
const DEFAULT_SEED_FILE = 'vehicles.seed.json';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function copyVehicle(vehicle: Vehicle): Vehicle {
  return JSON.parse(JSON.stringify(vehicle)) as Vehicle;
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

// Quản lý xe giao hàng: tạo, cho vào bảo trì, kích hoạt lại, nạp 5 xe mẫu
// lúc khởi động khi kho còn trống. Người gọi lấy từ token Keycloak, không
// nhận actor/role từ body.
@Injectable()
export class VehiclesService implements OnModuleInit {
  private readonly logger = new Logger(VehiclesService.name);
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(VEHICLE_STORE)
    private readonly store: VehicleStore = new InMemoryVehicleStore(),
  ) {}

  // Nạp seed trước rồi mới tính số thứ tự: kho trống thì 5 xe mẫu nhận
  // XE-1001 tới XE-1005 theo thứ tự trong tệp seed, xe tạo tay tiếp theo
  // là XE-1006; bảng đã có dữ liệu thì giữ nguyên, không nạp lại. Xe mẫu
  // ghi thẳng vào kho (giống seed tồn kho và kênh), không qua create()
  // nên không sinh audit vehicle.created.
  async onModuleInit(): Promise<void> {
    // Đọc và kiểm tra seed trước: tệp seed sai vẫn chặn khởi động, dù kho
    // đã có dữ liệu.
    const seed = this.loadSeed();
    const existing = await this.store.list();
    if (existing.length > 0) {
      this.logger.log(
        `Bảng đã có ${existing.length} xe trong DB, giữ nguyên dữ liệu.`,
      );
    } else {
      const now = new Date().toISOString();
      for (let index = 0; index < seed.length; index++) {
        const item = seed[index];
        const vehicle: Vehicle = {
          id: `XE-${String(1001 + index).padStart(4, '0')}`,
          plate: item.plate,
          type: item.type,
          status: 'Sẵn sàng',
          createdAt: now,
          updatedAt: now,
        };
        await this.store.save(vehicle);
      }
      this.logger.log(`Đã nạp ${seed.length} xe từ tệp seed.`);
    }
    const vehicles = await this.store.list();
    this.nextNumber = computeNextNumber(
      vehicles.map((vehicle) => vehicle.id),
      'XE',
    );
  }

  resolveSeedPath(): string {
    if (process.env.VEHICLES_SEED_PATH) {
      return process.env.VEHICLES_SEED_PATH;
    }
    return join(__dirname, 'data', DEFAULT_SEED_FILE);
  }

  async create(
    input: CreateVehicleInput,
    caller: Caller,
  ): Promise<Vehicle> {
    const plate = requireNonEmpty(
      input.plate,
      'Tạo xe cần có biển số.',
    ).trim();
    const type = requireNonEmpty(
      input.type,
      'Tạo xe cần có loại xe.',
    ).trim();
    requireRole(caller, DISPATCHER_ROLE, 'Tạo xe');
    // Biển số trùng là 409, không ghi audit vì đây là lỗi lúc tạo, giống
    // đơn trùng idempotencyKey ở OrdersService và tạo shipment sai.
    const existing = await this.store.findByPlate(plate);
    if (existing) {
      throw new ConflictException(
        `Biển số ${plate} đã có xe ${existing.id}.`,
      );
    }
    const now = new Date().toISOString();
    const vehicle: Vehicle = {
      id: `XE-${String(this.nextNumber++).padStart(4, '0')}`,
      plate,
      type,
      status: 'Sẵn sàng',
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(vehicle);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'vehicle.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: vehicle.id,
      from: null,
      to: 'Sẵn sàng',
      detail: `Biển số ${plate}, loại ${type}.`,
    });
    return copyVehicle(vehicle);
  }

  async get(id: string): Promise<Vehicle> {
    const vehicle = await this.store.findById(id);
    if (!vehicle) {
      throw new NotFoundException(`Không tìm thấy xe ${id}.`);
    }
    return copyVehicle(vehicle);
  }

  async list(
    filters: {
      status?: VehicleStatus;
    } = {},
  ): Promise<Vehicle[]> {
    const vehicles = await this.store.list();
    return vehicles.filter(
      (vehicle) =>
        filters.status === undefined || vehicle.status === filters.status,
    );
  }

  async maintenance(id: string, caller: Caller): Promise<Vehicle> {
    return this.changeStatus(
      id,
      'Sẵn sàng',
      'Bảo trì',
      caller,
      'Cho xe vào bảo trì',
      'vehicle.maintenance',
    );
  }

  async activate(id: string, caller: Caller): Promise<Vehicle> {
    return this.changeStatus(
      id,
      'Bảo trì',
      'Sẵn sàng',
      caller,
      'Kích hoạt lại xe',
      'vehicle.activated',
    );
  }

  // Đổi trạng thái xe do luồng shipment kéo theo: điều xe xong thì xe sang
  // Đang giao, giao xong hoặc giao thất bại thì xe về Sẵn sàng. Không ghi
  // audit vehicle riêng vì audit shipment.dispatched/delivered/failed đã
  // bao phủ sự kiện; không kiểm tra vai vì vai đã kiểm ở quy tắc shipment.
  async markBusy(id: string): Promise<Vehicle> {
    return this.setStatus(id, 'Đang giao');
  }

  async markAvailable(id: string): Promise<Vehicle> {
    return this.setStatus(id, 'Sẵn sàng');
  }

  private async setStatus(
    id: string,
    status: VehicleStatus,
  ): Promise<Vehicle> {
    const vehicle = await this.get(id);
    vehicle.status = status;
    vehicle.updatedAt = new Date().toISOString();
    await this.store.save(vehicle);
    return copyVehicle(vehicle);
  }

  private async changeStatus(
    id: string,
    from: VehicleStatus,
    to: VehicleStatus,
    caller: Caller,
    action: string,
    auditAction: string,
  ): Promise<Vehicle> {
    const vehicle = await this.get(id);
    // Kiểm trạng thái trước, kiểm vai sau, giống thứ tự ở dispatch của
    // shipment. Sai trạng thái là 409, không ghi audit denied riêng: các
    // action audit của xe chỉ có created, maintenance và activated.
    if (vehicle.status !== from) {
      throw new ConflictException(
        `Xe ${id} đang ở trạng thái "${vehicle.status}", chỉ ${action.toLowerCase()} khi xe ở "${from}".`,
      );
    }
    requireRole(caller, DISPATCHER_ROLE, action);
    const now = new Date().toISOString();
    vehicle.status = to;
    vehicle.updatedAt = now;
    await this.store.save(vehicle);
    await this.audit.append({
      actor: caller.username,
      role: DISPATCHER_ROLE,
      action: auditAction,
      orderId: vehicle.id,
      from,
      to,
      detail: `Biển số ${vehicle.plate}.`,
    });
    return copyVehicle(vehicle);
  }

  private loadSeed(): VehicleSeedItem[] {
    const path = this.resolveSeedPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp seed xe tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp seed xe tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`Tệp seed xe tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`);
    }
    const items = (parsed as Record<string, unknown>).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`Tệp seed xe tại ${path} không hợp lệ: items phải là mảng không rỗng.`);
    }
    const seen = new Set<string>();
    for (const item of items as unknown[]) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Tệp seed xe tại ${path} không hợp lệ: mỗi item phải là 1 object.`);
      }
      const entry = item as Record<string, unknown>;
      if (!isNonEmptyString(entry.plate)) {
        throw new Error(`Tệp seed xe tại ${path} không hợp lệ: mỗi item cần plate dạng chuỗi.`);
      }
      if (!isNonEmptyString(entry.type)) {
        throw new Error(`Tệp seed xe tại ${path} không hợp lệ: mỗi item cần type dạng chuỗi.`);
      }
      if (seen.has(entry.plate as string)) {
        throw new Error(`Tệp seed xe tại ${path} không hợp lệ: biển số ${String(entry.plate)} bị trùng.`);
      }
      seen.add(entry.plate as string);
    }
    return items as VehicleSeedItem[];
  }
}
