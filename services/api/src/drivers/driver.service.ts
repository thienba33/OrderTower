// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { isDriverOnly } from '../auth/permissions';
import { computeNextNumber } from '../db/id-counter';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryDriverStore, DRIVER_STORE } from './driver.store';
import type {
  AssignVehicleInput,
  CreateDriverInput,
  Driver,
  DriverSeedItem,
  DriverStatus,
  DriverStore,
} from './driver.types';

const DISPATCHER_ROLE = 'Điều phối viên';

// Tên tệp seed mặc định. Đổi tệp seed rồi khởi động lại thì tài xế mới có hiệu lực.
const DEFAULT_SEED_FILE = 'drivers.seed.json';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

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
// lại, nạp 5 tài xế mẫu lúc khởi động khi kho còn trống. Người gọi lấy
// từ token Keycloak, không nhận actor/role từ body.
@Injectable()
export class DriversService implements OnModuleInit {
  private readonly logger = new Logger(DriversService.name);
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

  // Nạp seed trước rồi mới tính số thứ tự: kho trống thì 5 tài xế mẫu
  // nhận TX-1001 tới TX-1005 theo thứ tự trong tệp seed, tài xế tạo tay
  // tiếp theo là TX-1006; bảng đã có dữ liệu thì giữ nguyên, không nạp
  // lại. Tài xế mẫu ghi thẳng vào kho (giống seed tồn kho và kênh),
  // không qua create() nên không sinh audit driver.created. Một tài xế
  // mẫu có username đúng "demo.driver" để màn Tài xế nhận ra tài khoản
  // demo đăng nhập; các username còn lại chỉ là dữ liệu mẫu, không có
  // tài khoản Keycloak tương ứng.
  async onModuleInit(): Promise<void> {
    // Đọc và kiểm tra seed trước: tệp seed sai vẫn chặn khởi động, dù kho
    // đã có dữ liệu.
    const seed = this.loadSeed();
    const existing = await this.store.list();
    if (existing.length > 0) {
      this.logger.log(
        `Bảng đã có ${existing.length} tài xế trong DB, giữ nguyên dữ liệu.`,
      );
    } else {
      const now = new Date().toISOString();
      for (let index = 0; index < seed.length; index++) {
        const item = seed[index];
        const driver: Driver = {
          id: `TX-${String(1001 + index).padStart(4, '0')}`,
          name: item.name,
          phone: item.phone,
          username: item.username,
          vehicleId: null,
          status: 'Sẵn sàng',
          createdAt: now,
          updatedAt: now,
        };
        await this.store.save(driver);
      }
      this.logger.log(`Đã nạp ${seed.length} tài xế từ tệp seed.`);
    }
    const drivers = await this.store.list();
    this.nextNumber = computeNextNumber(
      drivers.map((driver) => driver.id),
      'TX',
    );
  }

  resolveSeedPath(): string {
    if (process.env.DRIVERS_SEED_PATH) {
      return process.env.DRIVERS_SEED_PATH;
    }
    return join(__dirname, 'data', DEFAULT_SEED_FILE);
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

  // Tra tài xế theo username Keycloak. Dùng để scope dữ liệu của vai Tài
  // xế (chỉ thấy chuyến/đơn của mình) mà không tin tham số từ client.
  async findByUsername(username: string): Promise<Driver | null> {
    const driver = await this.store.findByUsername(username);
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

  // Vai tài xế thuần chỉ thấy hồ sơ của chính mình; vai nội bộ khác thấy
  // danh sách đầy đủ để điều xe/phân công.
  async listForCaller(
    filters: { status?: DriverStatus },
    caller: Caller,
  ): Promise<Driver[]> {
    if (!isDriverOnly(caller.roles)) {
      return this.list(filters);
    }
    const own = await this.findByUsername(caller.username);
    return own ? [own] : [];
  }

  async getForCaller(id: string, caller: Caller): Promise<Driver> {
    const driver = await this.get(id);
    if (!isDriverOnly(caller.roles)) {
      return driver;
    }
    const own = await this.findByUsername(caller.username);
    if (!own || own.id !== id) {
      throw new ForbiddenException(
        `Tài xế ${caller.username} không được xem hồ sơ tài xế ${id}.`,
      );
    }
    return driver;
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

  private loadSeed(): DriverSeedItem[] {
    const path = this.resolveSeedPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp seed tài xế tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp seed tài xế tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`);
    }
    const items = (parsed as Record<string, unknown>).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: items phải là mảng không rỗng.`);
    }
    const seenUsernames = new Set<string>();
    const seenPhones = new Set<string>();
    for (const item of items as unknown[]) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: mỗi item phải là 1 object.`);
      }
      const entry = item as Record<string, unknown>;
      if (!isNonEmptyString(entry.name)) {
        throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: mỗi item cần name dạng chuỗi.`);
      }
      if (!isNonEmptyString(entry.phone)) {
        throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: mỗi item cần phone dạng chuỗi.`);
      }
      if (!isNonEmptyString(entry.username)) {
        throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: mỗi item cần username dạng chuỗi.`);
      }
      if (seenUsernames.has(entry.username as string)) {
        throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: username ${String(entry.username)} bị trùng.`);
      }
      if (seenPhones.has(entry.phone as string)) {
        throw new Error(`Tệp seed tài xế tại ${path} không hợp lệ: số điện thoại ${String(entry.phone)} bị trùng.`);
      }
      seenUsernames.add(entry.username as string);
      seenPhones.add(entry.phone as string);
    }
    return items as DriverSeedItem[];
  }
}
