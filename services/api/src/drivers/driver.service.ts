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
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryDriverStore, DRIVER_STORE } from './driver.store';
import type {
  AssignVehicleInput,
  CreateDriverInput,
  Driver,
  DriverStatus,
  DriverStore,
} from './driver.types';

const DISPATCHER_ROLE = 'Điều phối viên';

function copyDriver(driver: Driver): Driver {
  return JSON.parse(JSON.stringify(driver)) as Driver;
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

// Quản lý tài xế giao hàng: tạo, gán xe thường lái, tạm nghỉ, kích hoạt
// lại. Người gọi lấy từ token Keycloak, không nhận actor/role từ body.
@Injectable()
export class DriversService implements OnModuleInit {
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  // VehiclesService tùy chọn để kiểm tra xe có thật khi gán xe; khi chạy
  // qua mô-đun, VehiclesModule luôn được nhập nên xe luôn kiểm được.
  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(DRIVER_STORE)
    private readonly store: DriverStore = new InMemoryDriverStore(),
    @Optional()
    private readonly vehicles?: VehiclesService,
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có TX-1001 thì tài xế mới là TX-1002,
  // không quay về TX-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const drivers = await this.store.list();
    this.nextNumber = computeNextNumber(
      drivers.map((driver) => driver.id),
      'TX',
    );
  }

  async create(
    input: CreateDriverInput,
    caller: Caller,
  ): Promise<Driver> {
    const name = requireNonEmpty(
      input.name,
      'Tạo tài xế cần có tên.',
    ).trim();
    const phone = requireNonEmpty(
      input.phone,
      'Tạo tài xế cần có số điện thoại.',
    ).trim();
    const username = requireNonEmpty(
      input.username,
      'Tạo tài xế cần có tên đăng nhập.',
    ).trim();
    requireRole(caller, DISPATCHER_ROLE, 'Tạo tài xế');
    // Trùng username hoặc trùng phone đều là 409, không ghi audit vì đây
    // là lỗi lúc tạo, giống đơn trùng idempotencyKey ở OrdersService và
    // tạo shipment sai.
    const byUsername = await this.store.findByUsername(username);
    if (byUsername) {
      throw new ConflictException(
        `Tên đăng nhập ${username} đã có tài xế ${byUsername.id}.`,
      );
    }
    const byPhone = await this.store.findByPhone(phone);
    if (byPhone) {
      throw new ConflictException(
        `Số điện thoại ${phone} đã có tài xế ${byPhone.id}.`,
      );
    }
    const now = new Date().toISOString();
    const driver: Driver = {
      id: `TX-${String(this.nextNumber++).padStart(4, '0')}`,
      name,
      phone,
      username,
      vehicleId: null,
      status: 'Sẵn sàng',
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(driver);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'driver.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: driver.id,
      from: null,
      to: 'Sẵn sàng',
      detail: `Tên ${name}, SĐT ${phone}, tài khoản ${username}.`,
    });
    return copyDriver(driver);
  }

  async get(id: string): Promise<Driver> {
    const driver = await this.findById(id);
    if (!driver) {
      throw new NotFoundException(`Không tìm thấy tài xế ${id}.`);
    }
    return driver;
  }

  // Tìm tài xế không ném lỗi: shipment dùng để kiểm tra quyền sở hữu,
  // tài xế không có thì chặn 409 fail-closed thay vì 404.
  async findById(id: string): Promise<Driver | null> {
    const driver = await this.store.findById(id);
    return driver ? copyDriver(driver) : null;
  }

  async list(
    filters: {
      status?: DriverStatus;
    } = {},
  ): Promise<Driver[]> {
    const drivers = await this.store.list();
    return drivers.filter(
      (driver) =>
        filters.status === undefined || driver.status === filters.status,
    );
  }

  async assignVehicle(
    id: string,
    input: AssignVehicleInput,
    caller: Caller,
  ): Promise<Driver> {
    const vehicleId = requireNonEmpty(
      input.vehicleId,
      'Gán xe cần có vehicleId.',
    ).trim();
    const driver = await this.get(id);
    requireRole(caller, DISPATCHER_ROLE, 'Gán xe cho tài xế');
    // Xe phải có thật và chưa gán cho tài xế khác; gán lại cho xe khác
    // được phép. Mô-đun xe vắng mặt (chỉ gặp khi dựng service bằng tay)
    // thì chặn luôn vì không kiểm tra được xe thật.
    const vehicles = this.vehicles;
    if (vehicles === undefined) {
      throw new ConflictException(
        `Không kiểm tra được xe ${vehicleId} vì mô-đun xe chưa được nối.`,
      );
    }
    await vehicles.get(vehicleId);
    const holders = await this.store.list();
    const other = holders.find(
      (item) => item.vehicleId === vehicleId && item.id !== id,
    );
    if (other) {
      throw new ConflictException(
        `Xe ${vehicleId} đã gán cho tài xế ${other.id}.`,
      );
    }
    const from = driver.vehicleId;
    const now = new Date().toISOString();
    driver.vehicleId = vehicleId;
    driver.updatedAt = now;
    await this.store.save(driver);
    await this.audit.append({
      actor: caller.username,
      role: DISPATCHER_ROLE,
      action: 'driver.vehicle.assigned',
      orderId: driver.id,
      from,
      to: vehicleId,
      detail: `Tên ${driver.name}.`,
    });
    return copyDriver(driver);
  }

  async unassignVehicle(id: string, caller: Caller): Promise<Driver> {
    const driver = await this.get(id);
    requireRole(caller, DISPATCHER_ROLE, 'Gỡ xe của tài xế');
    if (driver.vehicleId === null) {
      throw new ConflictException(`Tài xế ${id} chưa gán xe nào.`);
    }
    const from = driver.vehicleId;
    const now = new Date().toISOString();
    driver.vehicleId = null;
    driver.updatedAt = now;
    await this.store.save(driver);
    await this.audit.append({
      actor: caller.username,
      role: DISPATCHER_ROLE,
      action: 'driver.vehicle.unassigned',
      orderId: driver.id,
      from,
      to: null,
      detail: `Tên ${driver.name}.`,
    });
    return copyDriver(driver);
  }

  async rest(id: string, caller: Caller): Promise<Driver> {
    return this.changeStatus(
      id,
      'Sẵn sàng',
      'Tạm nghỉ',
      caller,
      'Cho tài xế tạm nghỉ',
      'driver.rest',
    );
  }

  async activate(id: string, caller: Caller): Promise<Driver> {
    return this.changeStatus(
      id,
      'Tạm nghỉ',
      'Sẵn sàng',
      caller,
      'Kích hoạt lại tài xế',
      'driver.activated',
    );
  }

  // Đổi trạng thái tài xế do luồng shipment kéo theo: điều xe xong thì
  // tài xế sang Đang giao, giao xong hoặc giao thất bại thì tài xế về Sẵn
  // sàng. Không ghi audit driver riêng vì audit
  // shipment.dispatched/delivered/failed đã bao phủ sự kiện; không kiểm
  // tra vai vì vai đã kiểm ở quy tắc shipment.
  async markBusy(id: string): Promise<Driver> {
    return this.setStatus(id, 'Đang giao');
  }

  async markAvailable(id: string): Promise<Driver> {
    return this.setStatus(id, 'Sẵn sàng');
  }

  private async setStatus(
    id: string,
    status: DriverStatus,
  ): Promise<Driver> {
    const driver = await this.get(id);
    driver.status = status;
    driver.updatedAt = new Date().toISOString();
    await this.store.save(driver);
    return copyDriver(driver);
  }

  private async changeStatus(
    id: string,
    from: DriverStatus,
    to: DriverStatus,
    caller: Caller,
    action: string,
    auditAction: string,
  ): Promise<Driver> {
    const driver = await this.get(id);
    // Kiểm trạng thái trước, kiểm vai sau, giống thứ tự ở dispatch của
    // shipment. Sai trạng thái là 409, không ghi audit denied riêng: các
    // action audit của tài xế chỉ có created, rest, activated và gán/gỡ xe.
    if (driver.status !== from) {
      throw new ConflictException(
        `Tài xế ${id} đang ở trạng thái "${driver.status}", chỉ ${action.toLowerCase()} khi tài xế ở "${from}".`,
      );
    }
    requireRole(caller, DISPATCHER_ROLE, action);
    const now = new Date().toISOString();
    driver.status = to;
    driver.updatedAt = now;
    await this.store.save(driver);
    await this.audit.append({
      actor: caller.username,
      role: DISPATCHER_ROLE,
      action: auditAction,
      orderId: driver.id,
      from,
      to,
      detail: `Tên ${driver.name}.`,
    });
    return copyDriver(driver);
  }
}
