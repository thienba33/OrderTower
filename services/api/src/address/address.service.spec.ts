// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AddressService,
  addressLevelFor,
} from './address.service';

describe('AddressService', () => {
  const originalGazetteerPath = process.env.ADDRESS_GAZETTEER_PATH;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'address-test-'));
  });

  afterEach(() => {
    if (originalGazetteerPath === undefined) {
      delete process.env.ADDRESS_GAZETTEER_PATH;
    } else {
      process.env.ADDRESS_GAZETTEER_PATH = originalGazetteerPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function loadService(): Promise<AddressService> {
    const service = new AddressService();
    await service.onModuleInit();
    return service;
  }

  it('địa chỉ đầy đủ khớp danh mục sau sáp nhập thì tin cậy 100', async () => {
    const service = await loadService();
    expect(
      service.evaluate({
        province: 'Hà Nội',
        ward: 'Phường Cửa Nam',
        street: 'Số 12 ngõ 34 phố Hàng Bè',
      }),
    ).toEqual({
      trust: 100,
      level: 'Tin cậy cao',
      provinceKnown: true,
      wardKnown: true,
      hasStreet: true,
    });
  });

  it('tên tỉnh đầy đủ ("Thành phố Hà Nội") và không dấu đều khớp', async () => {
    const service = await loadService();
    expect(
      service.evaluate({
        province: 'Thành phố Hà Nội',
        ward: 'Phường Cửa Nam',
        street: 'Số 12 ngõ 34 phố Hàng Bè',
      }).trust,
    ).toBe(100);
    expect(
      service.evaluate({
        province: 'Ha Noi',
        ward: 'Phuong Cua Nam',
        street: 'So 12 ngo 34 pho Hang Be',
      }).trust,
    ).toBe(100);
  });

  it('phường cũ đã sáp nhập ("Phường Phạm Đình Hổ") không còn tính điểm', async () => {
    const service = await loadService();
    const result = service.evaluate({
      province: 'Hà Nội',
      ward: 'Phường Phạm Đình Hổ',
      street: 'Số 8 phố Hàng Bè',
    });
    expect(result.trust).toBe(60);
    expect(result.wardKnown).toBe(false);
    expect(result.level).toBe('Rủi ro cao');
  });

  it('thiếu phường/xã thì 60, mức rủi ro cao (không còn 80 như thang cũ)', async () => {
    const service = await loadService();
    const result = service.evaluate({
      province: 'Hà Nội',
      street: 'Số 12 ngõ 34 phố Hàng Bè',
    });
    expect(result.trust).toBe(60);
    expect(result.level).toBe('Rủi ro cao');
    expect(result.wardKnown).toBe(false);
  });

  it('chỉ có tỉnh thì 40, mức rủi ro cao', async () => {
    const service = await loadService();
    const result = service.evaluate({ province: 'Hà Nội' });
    expect(result.trust).toBe(40);
    expect(result.level).toBe('Rủi ro cao');
  });

  it('trường quận/huyện cũ không còn chấm điểm', async () => {
    const service = await loadService();
    const withDistrict = service.evaluate({
      province: 'Hà Nội',
      district: 'Hồng Bàng',
      street: 'Số 12 Lê Lợi',
    });
    const withoutDistrict = service.evaluate({
      province: 'Hà Nội',
      street: 'Số 12 Lê Lợi',
    });
    expect(withDistrict.trust).toBe(60);
    expect(withDistrict.trust).toBe(withoutDistrict.trust);
  });

  it('tỉnh không còn tồn tại sau sáp nhập ("Tỉnh Bình Dương") thì chỉ tính điểm đường phố', async () => {
    const service = await loadService();
    const result = service.evaluate({
      province: 'Tỉnh Bình Dương',
      street: 'Số 1 Bạch Đằng',
    });
    expect(result.trust).toBe(20);
    expect(result.provinceKnown).toBe(false);
  });

  it('ngưỡng mức: 95 cao, 94 và 70 lưu ý, 69 rủi ro', () => {
    expect(addressLevelFor(95)).toBe('Tin cậy cao');
    expect(addressLevelFor(94)).toBe('Cần lưu ý');
    expect(addressLevelFor(70)).toBe('Cần lưu ý');
    expect(addressLevelFor(69)).toBe('Rủi ro cao');
  });

  it('chuỗi thô mẫu trong bản dự thảo cho 100 và phường Cửa Nam', async () => {
    const service = await loadService();
    const { suggestion } = service.suggestFromRaw(
      'Số 12 ngõ 34 phố Hàng Bè, p. trần hưng đạo, q. hoàn kiếm, hà nội',
    );
    expect(suggestion.province).toBe('Hà Nội');
    expect(suggestion.ward).toBe('Phường Cửa Nam');
    expect(suggestion.street).toBe('Số 12 ngõ 34 phố Hàng Bè');
    expect(suggestion.fuzzy).toBe(false);
  });

  it('thiếu đường thì 80, mức cần lưu ý', async () => {
    const service = await loadService();
    const { suggestion } = service.suggestFromRaw('Phường Cửa Nam, Hà Nội');
    expect(
      service.evaluate({
        province: suggestion.province,
        ward: suggestion.ward,
        street: suggestion.street,
      }).trust,
    ).toBe(80);
  });

  it('listWards trả danh sách phường đúng của tỉnh', async () => {
    const service = await loadService();
    const wards = service.listWards('Hà Nội');
    expect(wards).toHaveLength(126);
    expect(wards).toContain('Phường Cửa Nam');
    expect(service.listWards('Tỉnh Bình Dương')).toEqual([]);
  });

  it('tệp danh mục sai hình dạng thì chặn khởi động', async () => {
    const path = join(tempDir, 'address.test.json');
    writeFileSync(path, JSON.stringify({ provinces: [] }));
    process.env.ADDRESS_GAZETTEER_PATH = path;
    const service = new AddressService();
    await expect(service.onModuleInit()).rejects.toThrow(
      'không có tỉnh/thành nào',
    );
  });

  it('thiếu tệp danh mục thì chặn khởi động', async () => {
    process.env.ADDRESS_GAZETTEER_PATH = join(tempDir, 'khong-co.json');
    const service = new AddressService();
    await expect(service.onModuleInit()).rejects.toThrow(
      'Không tìm thấy tệp danh mục địa chỉ',
    );
  });
});
