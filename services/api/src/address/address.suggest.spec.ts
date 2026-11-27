// SPDX-License-Identifier: Apache-2.0
// Bộ 20 trường hợp kiểm thử của bản dự thảo AI chuẩn hóa địa chỉ (mục 7):
// 5 đã đúng, 5 lỗi gõ/mờ (chạy dạng chuỗi thô), 5 sai/thiếu phần, 5
// phường cũ -> mới + gợi ý từ đường. 3 trường hợp chạy thêm dạng tỉnh
// viết trước, kết quả phải giống hệt. Kỳ vọng đã kiểm chứng bằng cách
// chạy thuật toán trên dữ liệu thật (danh mục 2025 + bảng ánh xạ), không
// phải số tự nghĩ ra.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AddressParts,
  GazetteerProvince,
  LegacyWardMapping,
} from './address.types';
import {
  levenshtein,
  matchCandidate,
  matchExact,
  matchStrict,
  normalizeForMatch,
  scoreAddress,
  splitRawAddress,
  suggest,
} from './address.suggest';

const gazetteer = (
  JSON.parse(
    readFileSync(join(__dirname, 'data', 'address-gazetteer.json'), 'utf8'),
  ) as { provinces: GazetteerProvince[] }
).provinces;
const legacyMap = (
  JSON.parse(
    readFileSync(join(__dirname, 'data', 'address-legacy-map.json'), 'utf8'),
  ) as { mappings: LegacyWardMapping[] }
).mappings;

interface RunOutcome {
  province: string;
  ward: string;
  street: string;
  trust: number;
  fuzzy: boolean;
  choicesLength: number;
}

function runRaw(raw: string): RunOutcome {
  const { parts } = splitRawAddress(raw, gazetteer, legacyMap);
  return runParts(parts);
}

function runParts(parts: AddressParts): RunOutcome {
  const suggestion = suggest(parts, gazetteer, legacyMap);
  const trust = scoreAddress(
    suggestion.province || undefined,
    suggestion.ward || undefined,
    suggestion.street || undefined,
    gazetteer,
  ).trust;
  return {
    province: suggestion.province,
    ward: suggestion.ward,
    street: suggestion.street,
    trust,
    fuzzy: suggestion.fuzzy,
    choicesLength: suggestion.choices ? suggestion.choices.wards.length : 0,
  };
}

describe('normalizeForMatch / levenshtein / matchers', () => {
  it('bỏ dấu, bỏ tiền tố, viết thường, gọn khoảng trắng', () => {
    expect(normalizeForMatch('  p. Trần Hưng Đạo ')).toBe('tran hung dao');
    expect(normalizeForMatch('Thành phố Hà Nội')).toBe('ha noi');
    expect(normalizeForMatch('Tỉnh Quảng Ninh')).toBe('quang ninh');
    expect(normalizeForMatch('Phường Cửa Nam')).toBe('cua nam');
  });

  it('"đ" phải thành "d" (NFD không tách được "đ")', () => {
    expect(normalizeForMatch('Đạo')).toBe('dao');
    expect(normalizeForMatch('Phường Bãi Cháy')).toBe('bai chay');
  });

  it('levenshtein: đổi chỗ 2 ký tự tính là 2', () => {
    expect(levenshtein('cua nma', 'cua nam')).toBe(2);
    expect(levenshtein('hai ba trun', 'hai ba trung')).toBe(1);
    expect(levenshtein('ha noi', 'ha noi')).toBe(0);
  });

  it('matchCandidate: khớp chính xác, khớp mờ, và từ chối tên khác đầu', () => {
    expect(matchCandidate('Cua Nam', ['Phường Cửa Nam']).name).toBe(
      'Phường Cửa Nam',
    );
    expect(matchCandidate('Cua Nma', ['Phường Cửa Nam']).fuzzy).toBe(true);
    // "Cửa Nam" cách "Hà Nam" 2 lần sửa nhưng khác nhau ngay từ đầu nên
    // không phải lỗi gõ, không được khớp mờ.
    expect(matchCandidate('Cua Nam', ['Xã Hà Nam']).name).toBeNull();
    // "Trần Hưng Đạo" không được khớp chứa thành "Hưng Đạo".
    expect(matchCandidate('Tran Hung Dao', ['Xã Hưng Đạo']).name).toBeNull();
  });

  it('matchStrict: không dùng khớp chứa nên phần đường không bị nhận nhầm thành phường', () => {
    expect(matchStrict('So 5 pho Cua Nam', ['Phường Cửa Nam']).name).toBeNull();
    expect(matchStrict('Phuong Cua Nma', ['Phường Cửa Nam']).name).toBe(
      'Phường Cửa Nam',
    );
    expect(matchExact('So 5 pho Tran Hung Dao', ['Phường Trần Hưng Đạo'])).toBeNull();
  });
});

describe('splitRawAddress', () => {
  it('1 phần, không dấu phẩy: toàn bộ là đường', () => {
    const { parts, notes } = splitRawAddress(
      'Số 12 ngõ 34 phố Hàng Bè',
      gazetteer,
      legacyMap,
    );
    expect(parts).toEqual({ street: 'Số 12 ngõ 34 phố Hàng Bè' });
    expect(notes.join(' ')).toContain('1 phần');
  });

  it('phần đường chứa tên phường không bị nhận thành phường', () => {
    const { parts } = splitRawAddress(
      'Số 5 phố Trần Hưng Đạo, Hà Nội',
      gazetteer,
      legacyMap,
    );
    expect(parts.province).toBe('Hà Nội');
    expect(parts.ward).toBeUndefined();
    expect(parts.street).toBe('Số 5 phố Trần Hưng Đạo');
  });

  it('quận cũ đứng trước phần phường vẫn nhận đúng vai (tiền tố quyết định)', () => {
    const { parts } = splitRawAddress(
      'Số 12 ngõ 34 phố Hàng Bè, q. hoàn kiếm, p. trần hưng đạo, hà nội',
      gazetteer,
      legacyMap,
    );
    expect(parts.ward).toBe('p. trần hưng đạo');
    expect(parts.district).toBe('q. hoàn kiếm');
  });

  it('tỉnh viết trước cho kết quả tách giống hệt tỉnh viết sau', () => {
    const a = splitRawAddress(
      'Số 12 ngõ 34 phố Hàng Bè, Phường Cửa Nam, Hà Nội',
      gazetteer,
      legacyMap,
    ).parts;
    const b = splitRawAddress(
      'Hà Nội, Phường Cửa Nam, Số 12 ngõ 34 phố Hàng Bè',
      gazetteer,
      legacyMap,
    ).parts;
    expect(b).toEqual(a);
  });
});

describe('bộ 20 trường hợp (bản dự thảo mục 7)', () => {
  // 5 địa chỉ đã đúng.
  it.each([
    [
      'đúng, dạng thô (trường hợp mẫu)',
      'Số 12 ngõ 34 phố Hàng Bè, Phường Cửa Nam, Hà Nội',
      'Hà Nội',
      'Phường Cửa Nam',
      100,
      false,
    ],
    [
      'đúng, Hoàn Kiếm',
      'Số 3 phố Hàng Bạc, Phường Hoàn Kiếm, Hà Nội',
      'Hà Nội',
      'Phường Hoàn Kiếm',
      100,
      false,
    ],
  ])('%s', (_name, raw, province, ward, trust, fuzzy) => {
    const outcome = runRaw(raw as string);
    expect(outcome.province).toBe(province);
    expect(outcome.ward).toBe(ward);
    expect(outcome.trust).toBe(trust);
    expect(outcome.fuzzy).toBe(fuzzy);
  });

  it.each([
    [
      'đúng, có cấu trúc Hà Nội',
      { province: 'Hà Nội', ward: 'Phường Cửa Nam', street: 'Số 12 ngõ 34 phố Hàng Bè' },
      'Hà Nội',
      'Phường Cửa Nam',
      100,
    ],
    [
      'đúng, có cấu trúc Hải Phòng',
      { province: 'Hải Phòng', ward: 'Phường Hồng Bàng', street: 'Số 5 đường Lê Lợi' },
      'Hải Phòng',
      'Phường Hồng Bàng',
      100,
    ],
    [
      'đúng, có cấu trúc Quảng Ninh',
      { province: 'Quảng Ninh', ward: 'Phường Bãi Cháy', street: 'Số 10 đường Hạ Long' },
      'Quảng Ninh',
      'Phường Bãi Cháy',
      100,
    ],
  ])('%s', (_name, parts, province, ward, trust) => {
    const outcome = runParts(parts as AddressParts);
    expect(outcome.province).toBe(province);
    expect(outcome.ward).toBe(ward);
    expect(outcome.trust).toBe(trust);
  });

  // 5 lỗi gõ/mờ, chạy dạng chuỗi thô.
  it.each([
    [
      'không dấu (khớp chính xác sau chuẩn hóa, không tính là mờ)',
      'Số 12 ngõ 34 phố Hàng Bè, p. Cua Nam, Hà Nội',
      'Phường Cửa Nam',
      100,
      false,
    ],
    [
      'đổi chỗ 2 ký tự ở phường',
      'Số 12 ngõ 34 phố Hàng Bè, Phường Cửa Nma, Hà Nội',
      'Phường Cửa Nam',
      100,
      true,
    ],
    [
      'tỉnh không dấu',
      'Số 12 ngõ 34 phố Hàng Bè, Phường Cửa Nam, Ha Noi',
      'Phường Cửa Nam',
      100,
      false,
    ],
    [
      'thiếu 1 ký tự ở phường',
      'Số 12 ngõ 34 phố Hàng Bè, Phường Hai Ba Trun, Hà Nội',
      'Phường Hai Bà Trưng',
      100,
      true,
    ],
    [
      'phường Hải Phòng không dấu',
      'Số 5 đường Lê Lợi, Phường Hong Bang, Hải Phòng',
      'Phường Hồng Bàng',
      100,
      false,
    ],
  ])('%s', (_name, raw, ward, trust, fuzzy) => {
    const outcome = runRaw(raw as string);
    expect(outcome.ward).toBe(ward);
    expect(outcome.trust).toBe(trust);
    expect(outcome.fuzzy).toBe(fuzzy);
  });

  // 5 sai/thiếu phần.
  it('chỉ 1 phần, không dấu phẩy: toàn bộ là đường, tin cậy 20', () => {
    const outcome = runRaw('Số 12 ngõ 34 phố Hàng Bè');
    expect(outcome).toMatchObject({
      province: '',
      ward: '',
      trust: 20,
      fuzzy: false,
    });
  });

  it('thiếu phường: 60, mức thấp, trả danh sách 126 phường Hà Nội để nhập tay', () => {
    const outcome = runRaw('Số 12 ngõ 34 phố Hàng Bè, Hà Nội');
    expect(outcome.province).toBe('Hà Nội');
    expect(outcome.ward).toBe('');
    expect(outcome.trust).toBe(60);
    expect(outcome.choicesLength).toBe(126);
  });

  it('thiếu tỉnh nhưng phường chỉ có ở Hà Nội: suy ra tỉnh, 100', () => {
    const outcome = runRaw('Số 12 ngõ 34 phố Hàng Bè, Phường Cửa Nam');
    expect(outcome.province).toBe('Hà Nội');
    expect(outcome.ward).toBe('Phường Cửa Nam');
    expect(outcome.trust).toBe(100);
  });

  it('phường của tỉnh khác: không tính điểm phường, 60, trả 114 phường Hải Phòng', () => {
    const outcome = runRaw(
      'Số 12 ngõ 34 phố Hàng Bè, Phường Cửa Nam, Hải Phòng',
    );
    expect(outcome.province).toBe('Hải Phòng');
    expect(outcome.ward).toBe('');
    expect(outcome.trust).toBe(60);
    expect(outcome.choicesLength).toBe(114);
  });

  it('tỉnh không còn tồn tại (Bình Dương): chỉ tính điểm đường, 20', () => {
    const outcome = runRaw(
      'Số 1 đường Bạch Đằng, Phường Bến Nghé, Tỉnh Bình Dương',
    );
    expect(outcome).toMatchObject({
      province: '',
      ward: '',
      trust: 20,
      fuzzy: false,
    });
  });

  // 5 phường cũ -> mới + gợi ý từ đường.
  it.each([
    [
      'phường cũ hợp nhất toàn bộ (Trần Hưng Đạo -> Cửa Nam)',
      'Số 12 ngõ 34 phố Hàng Bè, p. trần hưng đạo, q. hoàn kiếm, hà nội',
      'Phường Cửa Nam',
      100,
      false,
    ],
    [
      'phường cũ tách, lấy phần chủ yếu (Phạm Đình Hổ -> Hai Bà Trưng)',
      'Số 8 phố Phạm Đình Hổ, Phường Phạm Đình Hổ, q. hai bà trưng, hà nội',
      'Phường Hai Bà Trưng',
      100,
      true,
    ],
    [
      'phường cũ tách, không ghi quận: vẫn lấy phần chủ yếu',
      'Số 8 phố Phạm Đình Hổ, Phường Phạm Đình Hổ, Hà Nội',
      'Phường Hai Bà Trưng',
      100,
      true,
    ],
  ])('%s', (_name, raw, ward, trust, fuzzy) => {
    const outcome = runRaw(raw as string);
    expect(outcome.ward).toBe(ward);
    expect(outcome.trust).toBe(trust);
    expect(outcome.fuzzy).toBe(fuzzy);
  });

  it('gợi ý từ đường: đường nhắc tới phường Cửa Nam thì sửa phường', () => {
    const outcome = runRaw('Số 5 phố Cửa Nam, Hà Nội');
    expect(outcome.ward).toBe('Phường Cửa Nam');
    expect(outcome.trust).toBe(100);
    expect(outcome.fuzzy).toBe(true);
  });

  it('đường nhắc tới tên phường cũ không được nhận thành phường (Trần Hưng Đạo không còn ở Hà Nội)', () => {
    const outcome = runRaw('Số 5 phố Trần Hưng Đạo, Hà Nội');
    expect(outcome.ward).toBe('');
    expect(outcome.trust).toBe(60);
    expect(outcome.choicesLength).toBe(126);
  });

  // 3 trường hợp chạy thêm dạng tỉnh viết trước, kết quả giống hệt.
  it.each([
    [
      'Hà Nội, Phường Cửa Nam, Số 12 ngõ 34 phố Hàng Bè',
      'Số 12 ngõ 34 phố Hàng Bè, Phường Cửa Nam, Hà Nội',
    ],
    [
      'Hà Nội, p. Cua Nam, Số 12 ngõ 34 phố Hàng Bè',
      'Số 12 ngõ 34 phố Hàng Bè, p. Cua Nam, Hà Nội',
    ],
    [
      'hà nội, p. trần hưng đạo, q. hoàn kiếm, Số 12 ngõ 34 phố Hàng Bè',
      'Số 12 ngõ 34 phố Hàng Bè, p. trần hưng đạo, q. hoàn kiếm, hà nội',
    ],
  ])('tỉnh viết trước: %s', (provinceFirst, normal) => {
    expect(runRaw(provinceFirst)).toEqual(runRaw(normal));
  });
});
