// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  AddressEvaluation,
  AddressInput,
  AddressLevel,
  GazetteerProvince,
} from './address.types';

// Mức tin cậy tối thiểu để đơn đi tiếp trong luồng. Dưới mức này là
// "Rủi ro cao", đúng 3 mức ở màn Phân tách địa chỉ bên frontend.
export const MIN_ADDRESS_TRUST = 70;

export function addressLevelFor(trust: number): AddressLevel {
  if (trust >= 95) return 'Tin cậy cao';
  if (trust >= MIN_ADDRESS_TRUST) return 'Cần lưu ý';
  return 'Rủi ro cao';
}

// Quy tắc chấm điểm, tỉnh 40, quận/huyện đúng tỉnh 30, phường/xã đúng
// quận/huyện 20, có địa chỉ chi tiết 10. Tổng tối đa 100.
const PROVINCE_POINTS = 40;
const DISTRICT_POINTS = 30;
const WARD_POINTS = 20;
const STREET_POINTS = 10;

const DEFAULT_GAZETTEER_FILE = 'address-gazetteer.json';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

// Chấm mức tin cậy địa chỉ theo danh mục hành chính. Hiện dùng bộ nhớ và
// tệp gazetteer đi kèm, sẽ chuyển sang Postgres khi nhánh platform-database
// vào dev.
@Injectable()
export class AddressService implements OnModuleInit {
  private readonly logger = new Logger(AddressService.name);
  private provinces: GazetteerProvince[] = [];

  onModuleInit(): void {
    this.provinces = this.loadGazetteer();
    const districts = this.provinces.reduce(
      (count, province) => count + province.districts.length,
      0,
    );
    this.logger.log(
      `Đã nạp danh mục địa chỉ ${this.provinces.length} tỉnh, ${districts} quận/huyện.`,
    );
  }

  resolveGazetteerPath(): string {
    if (process.env.ADDRESS_GAZETTEER_PATH) {
      return process.env.ADDRESS_GAZETTEER_PATH;
    }
    return join(__dirname, 'data', DEFAULT_GAZETTEER_FILE);
  }

  evaluate(address: AddressInput): AddressEvaluation {
    const province = this.provinces.find(
      (item) => item.name === address.province,
    );
    const provinceKnown = province !== undefined;
    const district = province?.districts.find(
      (item) => item.name === address.district,
    );
    const districtKnown = district !== undefined;
    const wardKnown =
      district !== undefined &&
      district.wards.includes(address.ward ?? '');
    const hasStreet = isNonEmptyString(address.street);
    let trust = 0;
    if (provinceKnown) trust += PROVINCE_POINTS;
    if (districtKnown) trust += DISTRICT_POINTS;
    if (wardKnown) trust += WARD_POINTS;
    if (hasStreet) trust += STREET_POINTS;
    return {
      trust,
      level: addressLevelFor(trust),
      provinceKnown,
      districtKnown,
      wardKnown,
      hasStreet,
    };
  }

  private loadGazetteer(): GazetteerProvince[] {
    const path = this.resolveGazetteerPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp danh mục địa chỉ tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp danh mục địa chỉ tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`);
    }
    const provinces = (parsed as Record<string, unknown>).provinces;
    if (!Array.isArray(provinces) || provinces.length === 0) {
      throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: provinces phải là mảng không rỗng.`);
    }
    for (const item of provinces as unknown[]) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: mỗi province phải là 1 object.`);
      }
      const province = item as Record<string, unknown>;
      if (!isNonEmptyString(province.name)) {
        throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: mỗi province cần name dạng chuỗi.`);
      }
      if (!Array.isArray(province.districts) || province.districts.length === 0) {
        throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: province ${String(province.name)} cần districts là mảng không rỗng.`);
      }
      for (const districtItem of province.districts as unknown[]) {
        if (typeof districtItem !== 'object' || districtItem === null) {
          throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: mỗi district phải là 1 object.`);
        }
        const district = districtItem as Record<string, unknown>;
        if (!isNonEmptyString(district.name)) {
          throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: mỗi district cần name dạng chuỗi.`);
        }
        if (!isStringArray(district.wards)) {
          throw new Error(`Tệp danh mục địa chỉ tại ${path} không hợp lệ: district ${String(district.name)} cần wards là mảng chuỗi.`);
        }
      }
    }
    return provinces as GazetteerProvince[];
  }
}
