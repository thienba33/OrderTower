// SPDX-License-Identifier: Apache-2.0
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AddressEvaluation,
  AddressInput,
  AddressParts,
  GazetteerProvince,
  LegacyWardMapping,
  SuggestedAddress,
} from './address.types';
import {
  addressLevelFor,
  normalizeForMatch,
  scoreAddress,
  shortProvinceName,
  splitRawAddress,
  suggest,
} from './address.suggest';

// Giữ lại hàm mức tin cậy ở đường nhập cũ (spec cũ và code khác có thể
// dùng); logic mức nằm trong address.suggest.ts.
export { addressLevelFor };

// Chấm điểm tin cậy địa chỉ theo thang 40/40/20 (tỉnh 40 + phường 40 +
// đường 20), ngưỡng áp dụng MIN_ADDRESS_TRUST = 70, 3 mức:
// >= 95 tin cậy cao, 70-94 cần lưu ý, < 70 rủi ro cao. Điểm đạt được chỉ
// có thể là 0/20/40/60/80/100 nên thực tế mức cao chỉ khi đủ 100, mức
// giữa chỉ khi 80.
// Danh mục chuẩn là danh mục hành chính sau sáp nhập 2025 (34
// tỉnh/thành, 3.321 xã/phường, không còn cấp quận/huyện) theo Quyết định
// 19/2025/QĐ-TTg. Trường quận/huyện cũ trong địa chỉ chỉ giữ lại cho dữ
// liệu lịch sử, không chấm điểm.
export const MIN_ADDRESS_TRUST = 70;

@Injectable()
export class AddressService implements OnModuleInit {
  private readonly logger = new Logger(AddressService.name);
  private gazetteer: GazetteerProvince[] | undefined;
  private legacyMap: LegacyWardMapping[] = [];

  async onModuleInit(): Promise<void> {
    this.gazetteer = this.loadGazetteer();
    this.legacyMap = this.loadLegacyMap();
    const wardCount = this.gazetteer.reduce((n, p) => n + p.wards.length, 0);
    this.logger.log(
      `Đã tải danh mục địa chỉ: ${this.gazetteer.length} tỉnh/thành, ${wardCount} xã/phường, ${this.legacyMap.length} ánh xạ cũ -> mới.`,
    );
  }

  // Chấm điểm 1 địa chỉ đã tách sẵn. Chỉ chấm khớp chính xác sau chuẩn
  // hóa (bỏ dấu, bỏ tiền tố); sửa lỗi gõ thuộc về thuật toán đề xuất
  // (suggest), không thuộc về hàm chấm này.
  evaluate(address: AddressInput): AddressEvaluation {
    if (!this.gazetteer) {
      throw new Error('Danh mục địa chỉ chưa được tải.');
    }
    return scoreAddress(
      address.province,
      address.ward,
      address.street,
      this.gazetteer,
    );
  }

  // Đề xuất chuẩn hóa từ các phần địa chỉ đã tách sẵn (form nhập tay).
  suggestFromParts(parts: AddressParts): SuggestedAddress {
    this.assertLoaded();
    return suggest(parts, this.gazetteer!, this.legacyMap);
  }

  // Đề xuất chuẩn hóa từ chuỗi thô dán vào (ví dụ "Số 12 ngõ 34 phố Hàng
  // Bè, p. trần hưng đạo, q. hoàn kiếm, hà nội"): tách theo nội dung rồi
  // đề xuất như suggestFromParts. Trả kèm các phần đã tách (để ghi ảnh
  // chụp "trước") và ghi chú tách chuỗi.
  suggestFromRaw(raw: string): {
    suggestion: SuggestedAddress;
    parts: AddressParts;
    notes: string[];
  } {
    this.assertLoaded();
    const { parts, notes } = splitRawAddress(
      raw,
      this.gazetteer!,
      this.legacyMap,
    );
    return {
      suggestion: suggest(parts, this.gazetteer!, this.legacyMap),
      parts,
      notes,
    };
  }

  // Đề xuất chuẩn hóa từ 1 địa chỉ có cấu trúc {province, ward, street}
  // (không kèm orderId, chỉ trả đề xuất, không lưu).
  suggestFromAddress(address: AddressInput): SuggestedAddress {
    return this.suggestFromParts({
      province: address.province,
      ward: address.ward,
      district: address.district,
      street: address.street ?? '',
    });
  }

  // Danh sách phường đúng của 1 tỉnh (tên đầy đủ như danh mục), để nhập
  // tay khi mức thấp. Trả [] khi tỉnh không có trong danh mục.
  listWards(provinceName: string): string[] {
    this.assertLoaded();
    const province = this.gazetteer!.find(
      (p) => normalizeForMatch(p.name) === normalizeForMatch(provinceName),
    );
    return province ? province.wards.map((w) => w.name) : [];
  }

  // Tên ngắn của tỉnh ("Hà Nội") từ tên nhập vào, để hiển thị; trả tên
  // gốc khi không khớp danh mục.
  shortProvince(provinceName: string): string {
    this.assertLoaded();
    const province = this.gazetteer!.find(
      (p) => normalizeForMatch(p.name) === normalizeForMatch(provinceName),
    );
    return province ? shortProvinceName(province.name) : provinceName;
  }

  private assertLoaded(): void {
    if (!this.gazetteer) {
      throw new Error('Danh mục địa chỉ chưa được tải.');
    }
  }

  // Đường dẫn tới danh mục. Mặc định là tệp trong repo; có thể ghi đè
  // bằng biến môi trường ADDRESS_GAZETTEER_PATH (kiểm thử, môi trường
  // triển khai riêng).
  private resolveGazetteerPath(): string {
    if (process.env.ADDRESS_GAZETTEER_PATH) {
      return process.env.ADDRESS_GAZETTEER_PATH;
    }
    return join(__dirname, 'data', 'address-gazetteer.json');
  }

  private resolveLegacyMapPath(): string {
    if (process.env.ADDRESS_LEGACY_MAP_PATH) {
      return process.env.ADDRESS_LEGACY_MAP_PATH;
    }
    return join(__dirname, 'data', 'address-legacy-map.json');
  }

  private loadGazetteer(): GazetteerProvince[] {
    const path = this.resolveGazetteerPath();
    if (!existsSync(path)) {
      throw new Error(`Không tìm thấy tệp danh mục địa chỉ: ${path}`);
    }
    const data = JSON.parse(readFileSync(path, 'utf8')) as {
      provinces: GazetteerProvince[];
    };
    if (!Array.isArray(data.provinces) || data.provinces.length === 0) {
      throw new Error('Danh mục địa chỉ không có tỉnh/thành nào.');
    }
    for (const province of data.provinces) {
      if (!province.name || !Array.isArray(province.wards) || province.wards.length === 0) {
        throw new Error(`Tỉnh "${province.name ?? '(không tên)'}" không có xã/phường nào.`);
      }
      for (const ward of province.wards) {
        if (!ward.name) {
          throw new Error(`Tỉnh "${province.name}" có xã/phường không có tên.`);
        }
      }
    }
    return data.provinces;
  }

  private loadLegacyMap(): LegacyWardMapping[] {
    const path = this.resolveLegacyMapPath();
    if (!existsSync(path)) {
      this.logger.warn(
        `Không tìm thấy bảng ánh xạ phường cũ -> mới: ${path}. Đề xuất sẽ không tra được phường cũ.`,
      );
      return [];
    }
    const data = JSON.parse(readFileSync(path, 'utf8')) as {
      mappings: LegacyWardMapping[];
    };
    if (!Array.isArray(data.mappings)) {
      throw new Error('Bảng ánh xạ phường cũ -> mới sai định dạng (thiếu mảng mappings).');
    }
    return data.mappings;
  }
}
