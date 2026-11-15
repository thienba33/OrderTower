// SPDX-License-Identifier: Apache-2.0
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { CustomersService } from './customer.service';
import { InMemoryCustomerStore } from './customer.store';

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
  customers: CustomersService;
}> {
  const audit = new AuditService();
  const customers = new CustomersService(audit, new InMemoryCustomerStore());
  await customers.onModuleInit();
  return { audit, customers };
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

describe('CustomersService', () => {
  it('tạo khách hàng, ghi audit customer.created', async () => {
    const { audit, customers } = await buildServices();
    const customer = await customers.create(
      {
        name: 'Hộ nước mắm A',
        phone: '0901234567',
        address: 'Số 8 phố Hàng Bè, Hai Bà Trưng, Hà Nội',
      },
      COORDINATOR,
    );
    expect(customer.id).toBe('KH-1001');
    expect(customer.name).toBe('Hộ nước mắm A');
    expect(customer.phone).toBe('0901234567');
    expect(customer.address).toBe('Số 8 phố Hàng Bè, Hai Bà Trưng, Hà Nội');
    expect(await actionCount(audit, 'customer.created')).toBe(1);
    const created = (await audit.getAll()).find(
      (record) => record.action === 'customer.created',
    );
    expect(created).toMatchObject({
      actor: 'son',
      orderId: 'KH-1001',
      from: null,
      to: null,
    });
    expect(created?.detail).toContain('Hộ nước mắm A');
  });

  it('tạo khách hàng không địa chỉ thì address null', async () => {
    const { customers } = await buildServices();
    const customer = await customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    expect(customer.id).toBe('KH-1001');
    expect(customer.address).toBeNull();
  });

  it('tạo khách hàng thiếu tên hoặc SĐT thì báo 400', async () => {
    const { customers } = await buildServices();
    await expect(
      customers.create({ name: '  ', phone: '0901234567' }, COORDINATOR),
    ).rejects.toThrow('Tạo khách hàng cần có tên');
    await expect(
      customers.create({ name: 'Hộ nước mắm A', phone: '   ' }, COORDINATOR),
    ).rejects.toThrow('Tạo khách hàng cần có SĐT');
    expect(await customers.list()).toHaveLength(0);
  });

  it('tạo khách hàng trùng SĐT thì báo 409, không ghi audit', async () => {
    const { audit, customers } = await buildServices();
    await customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    await expect(
      customers.create(
        { name: 'Hộ nước mắm B', phone: '0901234567' },
        COORDINATOR,
      ),
    ).rejects.toThrow('SĐT 0901234567 đã có khách hàng KH-1001');
    expect(await customers.list()).toHaveLength(1);
    expect(await actionCount(audit, 'customer.created')).toBe(1);
  });

  it('tạo khách hàng bởi Tài xế thì báo 409', async () => {
    const { customers } = await buildServices();
    await expect(
      customers.create(
        { name: 'Hộ nước mắm A', phone: '0901234567' },
        DRIVER,
      ),
    ).rejects.toThrow('cần vai Điều phối viên');
    expect(await customers.list()).toHaveLength(0);
  });

  it('tên và SĐT được cắt khoảng trắng trước khi lưu', async () => {
    const { customers } = await buildServices();
    const customer = await customers.create(
      { name: '  Hộ nước mắm A  ', phone: ' 0901234567 ' },
      COORDINATOR,
    );
    expect(customer.name).toBe('Hộ nước mắm A');
    expect(customer.phone).toBe('0901234567');
    await expect(
      customers.create(
        { name: 'Hộ nước mắm B', phone: '0901234567' },
        COORDINATOR,
      ),
    ).rejects.toThrow('SĐT 0901234567 đã có khách hàng KH-1001');
  });

  it('get không tìm thấy thì 404, list lọc theo SĐT, findByPhone', async () => {
    const { customers } = await buildServices();
    await customers.create(
      { name: 'Hộ nước mắm A', phone: '0901234567' },
      COORDINATOR,
    );
    await customers.create(
      { name: 'Hộ nước mắm B', phone: '0901234568' },
      COORDINATOR,
    );
    await expect(customers.get('KH-9999')).rejects.toThrow(
      'Không tìm thấy khách hàng KH-9999',
    );
    expect(await customers.findById('KH-9999')).toBeNull();
    expect(await customers.findByPhone('0901234567')).toMatchObject({
      id: 'KH-1001',
    });
    expect(await customers.findByPhone('0999999999')).toBeNull();
    expect(await customers.list()).toHaveLength(2);
    expect(
      (await customers.list({ phone: '0901234568' })).map(
        (customer) => customer.id,
      ),
    ).toEqual(['KH-1002']);
    expect(await customers.list({ phone: '0999999999' })).toHaveLength(0);
  });
});
