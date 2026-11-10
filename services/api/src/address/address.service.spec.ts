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

  function loadService(): AddressService {
    const service = new AddressService();
    service.onModuleInit();
    return service;
  }

  it('địa chỉ đầy đủ khớp danh mục thì tin cậy 100', () => {
    const service = loadService();
    expect(
      service.evaluate({
        province: 'Hà Nội',
        district: 'Hai Bà Trưng',
        ward: 'Phường Phạm Đình Hổ',
        street: 'Số 8 phố Hàng Bè',
      }),
    ).toEqual({
      trust: 100,
      level: 'Tin cậy cao',
      provinceKnown: true,
      districtKnown: true,
      wardKnown: true,
      hasStreet: true,
    });
  });

  it('thiếu phường/xã thì 80, vẫn qua mức tối thiểu', () => {
    const service = loadService();
    const result = service.evaluate({
      province: 'Hà Nội',
      district: 'Hai Bà Trưng',
      street: 'Số 8 phố Hàng Bè',
    });
    expect(result.trust).toBe(80);
    expect(result.level).toBe('Cần lưu ý');
    expect(result.wardKnown).toBe(false);
  });

  it('chỉ có tỉnh thì 40, mức rủi ro cao', () => {
    const service = loadService();
    const result = service.evaluate({ province: 'Hà Nội' });
    expect(result.trust).toBe(40);
    expect(result.level).toBe('Rủi ro cao');
  });

  it('quận/huyện không thuộc tỉnh thì không tính điểm', () => {
    const service = loadService();
    const result = service.evaluate({
      province: 'Hà Nội',
      district: 'Hồng Bàng',
      street: 'Số 12 Lê Lợi',
    });
    expect(result.trust).toBe(50);
    expect(result.districtKnown).toBe(false);
    expect(result.level).toBe('Rủi ro cao');
  });

  it('tỉnh không có trong danh mục thì chỉ tính điểm đường phố', () => {
    const service = loadService();
    const result = service.evaluate({
      province: 'Đà Nẵng',
      street: 'Số 1 Bạch Đằng',
    });
    expect(result.trust).toBe(10);
    expect(result.provinceKnown).toBe(false);
  });

  it('ngưỡng mức: 95 cao, 94 và 70 lưu ý, 69 rủi ro', () => {
    expect(addressLevelFor(95)).toBe('Tin cậy cao');
    expect(addressLevelFor(94)).toBe('Cần lưu ý');
    expect(addressLevelFor(70)).toBe('Cần lưu ý');
    expect(addressLevelFor(69)).toBe('Rủi ro cao');
  });

  it('tệp danh mục sai hình dạng thì chặn khởi động', () => {
    const path = join(tempDir, 'address.test.json');
    writeFileSync(path, JSON.stringify({ provinces: [] }));
    process.env.ADDRESS_GAZETTEER_PATH = path;
    const service = new AddressService();
    expect(() => service.onModuleInit()).toThrow('mảng không rỗng');
  });
});
