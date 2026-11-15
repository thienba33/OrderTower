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
import { InMemoryCustomerStore, CUSTOMER_STORE } from './customer.store';
import type {
  CreateCustomerInput,
  Customer,
  CustomerStore,
} from './customer.types';

const DISPATCHER_ROLE = 'Điều phối viên';

function copyCustomer(customer: Customer): Customer {
  return JSON.parse(JSON.stringify(customer)) as Customer;
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

// Chuỗi tùy chọn: cắt khoảng trắng 2 đầu, rỗng thì về null để không lưu
// chuỗi toàn khoảng trắng vào kho.
function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Quản lý khách hàng: tạo và tra cứu, không sửa, không xóa. Người gọi lấy
// từ token Keycloak, không nhận actor/role từ body.
@Injectable()
export class CustomersService implements OnModuleInit {
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(CUSTOMER_STORE)
    private readonly store: CustomerStore = new InMemoryCustomerStore(),
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có KH-1001 thì khách mới là KH-1002,
  // không quay về KH-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const customers = await this.store.list();
    this.nextNumber = computeNextNumber(
      customers.map((customer) => customer.id),
      'KH',
    );
  }

  async create(
    input: CreateCustomerInput,
    caller: Caller,
  ): Promise<Customer> {
    const name = requireNonEmpty(
      input.name,
      'Tạo khách hàng cần có tên.',
    ).trim();
    const phone = requireNonEmpty(
      input.phone,
      'Tạo khách hàng cần có SĐT.',
    ).trim();
    const address = optionalText(input.address);
    requireRole(caller, DISPATCHER_ROLE, 'Tạo khách hàng');
    // SĐT trùng là 409, không ghi audit vì đây là lỗi lúc tạo, giống tên
    // kênh trùng ở ChannelsService và đơn trùng idempotencyKey.
    const existing = await this.store.findByPhone(phone);
    if (existing) {
      throw new ConflictException(
        `SĐT ${phone} đã có khách hàng ${existing.id}.`,
      );
    }
    const now = new Date().toISOString();
    const customer: Customer = {
      id: `KH-${String(this.nextNumber++).padStart(4, '0')}`,
      name,
      phone,
      address,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(customer);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'customer.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: customer.id,
      from: null,
      to: null,
      detail: `Tên: ${name}; SĐT: ${phone}.`,
    });
    return copyCustomer(customer);
  }

  async get(id: string): Promise<Customer> {
    const customer = await this.findById(id);
    if (!customer) {
      throw new NotFoundException(`Không tìm thấy khách hàng ${id}.`);
    }
    return customer;
  }

  // Tìm khách hàng không ném lỗi: đơn dùng để kiểm tra khách có thật,
  // khách không có thì báo 404.
  async findById(id: string): Promise<Customer | null> {
    const customer = await this.store.findById(id);
    return customer ? copyCustomer(customer) : null;
  }

  // Tìm khách hàng theo SĐT, không ném lỗi.
  async findByPhone(phone: string): Promise<Customer | null> {
    const customer = await this.store.findByPhone(phone);
    return customer ? copyCustomer(customer) : null;
  }

  async list(
    filters: {
      phone?: string;
    } = {},
  ): Promise<Customer[]> {
    const customers = await this.store.list();
    return customers.filter(
      (customer) =>
        filters.phone === undefined || customer.phone === filters.phone,
    );
  }
}
