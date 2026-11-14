// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
  VehicleStatus,
  VehicleStore,
} from './vehicle.types';

const DISPATCHER_ROLE = 'Điều phối viên';

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

// Quản lý xe giao hàng: tạo, cho vào bảo trì, kích hoạt lại. Người gọi lấy
// từ token Keycloak, không nhận actor/role từ body.
@Injectable()
export class VehiclesService implements OnModuleInit {
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(VEHICLE_STORE)
    private readonly store: VehicleStore = new InMemoryVehicleStore(),
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có XE-1001 thì xe mới là XE-1002,
  // không quay về XE-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const vehicles = await this.store.list();
    this.nextNumber = computeNextNumber(
      vehicles.map((vehicle) => vehicle.id),
      'XE',
    );
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
}
