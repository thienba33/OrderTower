// SPDX-License-Identifier: Apache-2.0
// Thuật toán đề xuất chuẩn hóa địa chỉ: chỉ luật xác định + dữ liệu thật,
// không gọi mô hình hay API bên ngoài (quy tắc cuộc thi PMNM: mọi tính
// năng phải chạy được từ repo, không phụ thuộc mạng). Toàn bộ hàm ở đây là
// hàm thuần (không đọc file, không gọi DB), nhận danh mục + bảng ánh xạ
// làm đầu vào, để kiểm thử được trực tiếp không cần khởi động NestJS.

import {
  AddressEvaluation,
  AddressParts,
  GazetteerProvince,
  LegacyWardMapping,
  MatchResult,
  SuggestedAddress,
} from './address.types';

// ---------------------------------------------------------------------------
// Chuẩn hóa để so khớp (chỉ dùng khi so sánh, kết quả trả về giữ nguyên
// dấu và cách ghi gốc): bỏ khoảng trắng thừa, viết thường, bỏ dấu, bỏ
// tiền tố hành chính (tỉnh/thành phố/quận/huyện/phường/xã và viết tắt
// tp./p./q.).
// ---------------------------------------------------------------------------

const ADMIN_PREFIXES = [
  'thanh pho ',
  'tinh ',
  'quan ',
  'huyen ',
  'phuong ',
  'xa ',
  'tp. ',
  'tp ',
  'p. ',
  'p ',
  'q. ',
  'q ',
  // Biến thể không có khoảng trắng sau dấu chấm ("p.Trần Hưng Đạo"),
  // để sau biến thể có khoảng trắng để "p. Trần" bỏ cả "p. " trước.
  'tp.',
  'p.',
  'q.',
];

export function normalizeForMatch(value: string): string {
  let s = value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // "đ" không tách được bằng NFD (không phải chữ gốc + dấu), phải đổi
    // tay sang "d", nếu không "Trần Hưng Đạo" thành "tran hung đao" và
    // không khớp được với gì cả.
    .replace(/đ/g, 'd');
  for (const prefix of ADMIN_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  return s.trim().replace(/^[.\s]+|[.\s]+$/g, '');
}

// Bỏ tiền tố tỉnh/thành phố ở tên chính thức để hiển thị dạng tên ngắn
// ("Thành phố Hà Nội" -> "Hà Nội"), giống cách dữ liệu mẫu và màn hình
// đang ghi.
export function shortProvinceName(name: string): string {
  return name.replace(/^(Tỉnh|Thành phố)\s+/i, '').trim();
}

// Khoảng cách Levenshtein (số lần sửa tối thiểu để biến a thành b).
// Viết tay vì repo chưa có hàm này; chuỗi địa chỉ ngắn nên vòng lặp
// O(n*m) là đủ.
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ---------------------------------------------------------------------------
// Khớp 1 chuỗi nhập với danh sách tên ứng viên, theo thang:
//   1. khớp chính xác sau khi chuẩn hóa;
//   2. khớp mờ (Levenshtein <= 2).
// KHÔNG có bước khớp chứa: tên phường ngắn hay là phần đuôi của tên dài
// hơn ("Hưng Đạo" nằm trong "Trần Hưng Đạo"), khớp chứa sẽ nhận nhầm
// phường khác. Khớp mờ yêu cầu 2 ký tự đầu giống nhau, để "Cửa Nam"
// không khớp mờ thành "Hà Nam" (khác nhau ngay từ đầu) trong khi lỗi gõ
// thật ("Cửa Nma", "Hai Ba Trun") vẫn nhận được. Khớp mờ được đánh dấu
// fuzzy để người duyệt biết phần đó cần xem kỹ. Khi nhiều ứng viên ngang
// nhau ở bước 2 thì không chọn (trả về ambiguous) thay vì đoán mò.
// ---------------------------------------------------------------------------

export function matchCandidate(
  rawInput: string,
  candidates: string[],
): MatchResult {
  const input = normalizeForMatch(rawInput);
  if (!input) {
    return { name: null, fuzzy: false, method: null, ambiguous: false };
  }
  const normalized = candidates.map((name) => ({
    name,
    key: normalizeForMatch(name),
  }));
  const exact = normalized.find((c) => c.key === input);
  if (exact) {
    return { name: exact.name, fuzzy: false, method: 'exact', ambiguous: false };
  }
  let bestDistance = Number.POSITIVE_INFINITY;
  let best: { name: string; key: string } | null = null;
  let tie = false;
  for (const c of normalized) {
    // Lỗi gõ thật giữ nguyên đầu tên; tên khác hẳn ngay từ 2 ký tự đầu
    // (ví dụ "Cửa Nam" so với "Hà Nam") thì không phải lỗi gõ.
    if (c.key.slice(0, 2) !== input.slice(0, 2)) continue;
    const d = levenshtein(input, c.key);
    if (d < bestDistance) {
      bestDistance = d;
      best = c;
      tie = false;
    } else if (d === bestDistance) {
      tie = true;
    }
  }
  if (best && bestDistance <= 2 && !tie) {
    return { name: best.name, fuzzy: true, method: 'fuzzy', ambiguous: false };
  }
  return { name: null, fuzzy: false, method: null, ambiguous: tie };
}

// Khớp chặt dùng khi tách chuỗi thô: chỉ khớp chính xác sau chuẩn hóa
// hoặc khớp mờ (Levenshtein <= 2), KHÔNG dùng khớp chứa. Khớp chứa ở
// đây sẽ nhận nhầm phần đường nhắc tới tên phường (ví dụ "Số 5 phố Cửa
// Nam" chứa "Cửa Nam") thành phường, làm mất phần đường; trong khi lỗi
// gõ nhẹ ở phần phường (ví dụ "Cửa Nma") vẫn cần nhận được để sửa.
// Khi nhiều ứng viên cùng khoảng cách ngắn nhất thì không chọn (trả
// null) thay vì đoán mò.
export function matchStrict(
  rawInput: string,
  candidates: string[],
): { name: string | null; fuzzy: boolean } {
  const input = normalizeForMatch(rawInput);
  if (!input) return { name: null, fuzzy: false };
  const exact = candidates.find((name) => normalizeForMatch(name) === input);
  if (exact) return { name: exact, fuzzy: false };
  let bestDistance = Number.POSITIVE_INFINITY;
  let best: string | null = null;
  let tie = false;
  for (const name of candidates) {
    const key = normalizeForMatch(name);
    // Như matchCandidate: lỗi gõ thật giữ nguyên đầu tên.
    if (key.slice(0, 2) !== input.slice(0, 2)) continue;
    const d = levenshtein(input, key);
    if (d < bestDistance) {
      bestDistance = d;
      best = name;
      tie = false;
    } else if (d === bestDistance) {
      tie = true;
    }
  }
  if (best && bestDistance <= 2 && !tie) return { name: best, fuzzy: true };
  return { name: null, fuzzy: false };
}

// Khớp chính xác sau chuẩn hóa, dùng khi tách chuỗi thô (một phần chỉ
// được nhận là phường khi khớp đúng tên phường, tránh việc phần đường
// như "Số 5 phố Trần Hưng Đạo" bị nhận nhầm thành phường).
export function matchExact(
  rawInput: string,
  candidates: string[],
): string | null {
  const input = normalizeForMatch(rawInput);
  if (!input) return null;
  const found = candidates.find((name) => normalizeForMatch(name) === input);
  return found ?? null;
}

// ---------------------------------------------------------------------------
// Tách chuỗi địa chỉ thô (dán từ hệ thống khác) thành các phần theo NỘI
// DUNG, không theo vị trí: tỉnh tìm trước (chuỗi có thể ghi tỉnh trước
// hoặc sau), rồi phường khớp chính xác trong tỉnh đó, phần quận/huyện cũ
// chỉ để tra bảng ánh xạ, phần còn lại nối lại thành đường. 1 phần duy
// nhất, không có dấu phẩy, thì toàn bộ là đường, tỉnh/phường chưa biết.
// ---------------------------------------------------------------------------

export function splitRawAddress(
  raw: string,
  gazetteer: GazetteerProvince[],
  legacyMap: LegacyWardMapping[],
): { parts: AddressParts; notes: string[] } {
  const notes: string[] = [];
  const segments = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) {
    return { parts: { street: '' }, notes: ['Chuỗi rỗng, không có phần nào.'] };
  }
  if (segments.length === 1) {
    notes.push(
      'Chỉ có 1 phần, không có dấu phẩy: coi toàn bộ là số nhà/đường, tỉnh/phường chưa biết.',
    );
    return { parts: { street: segments[0] }, notes };
  }

  const provinceNames = gazetteer.map((p) => p.name);
  let provincePart: string | undefined;
  let province: GazetteerProvince | undefined;
  const unmatched: string[] = [];

  // Lượt 1: tìm tỉnh trước (theo nội dung, không theo vị trí), phần còn
  // lại để sang lượt sau.
  for (const seg of segments) {
    if (!province) {
      const match = matchCandidate(seg, provinceNames);
      if (match.name && !match.ambiguous) {
        province = gazetteer.find((p) => p.name === match.name);
        provincePart = seg;
        if (match.fuzzy) {
          notes.push(
            `Phần "${seg}" khớp tỉnh bằng khớp mờ, cần kiểm tra lại.`,
          );
        }
        continue;
      }
    }
    unmatched.push(seg);
  }

  // Lượt 2: khớp phường và quận cũ trong các phần còn lại.
  // Phường nhận cả tên phường hiện tại lẫn tên phường cũ (đã sáp nhập
  // 01/07/2025), vì bước đề xuất sau đó mới tra bảng ánh xạ cũ -> mới;
  // nếu chỉ nhận phường hiện tại thì phường cũ sẽ rơi vào phần đường và
  // không tra được ánh xạ.
  // Khi chưa biết tỉnh, một phần chỉ được nhận là phường khi tên đó chỉ
  // có ở đúng 1 tỉnh (phường hiện tại) hoặc chỉ về đúng 1 tỉnh mới
  // (phường cũ); tên trùng ở nhiều tỉnh thì để lại làm đường, cần ghi rõ
  // tỉnh.
  const wardNamesOf = (p: GazetteerProvince) => p.wards.map((w) => w.name);
  const oldWardNamesOf = (p: GazetteerProvince) =>
    legacyMap
      .filter(
        (row) =>
          normalizeForMatch(row.oldProvince) ===
          normalizeForMatch(shortProvinceName(p.name)),
      )
      .map((row) => row.oldWard);
  const legacyDistrictsOf = (p: GazetteerProvince) => [
    ...new Set(
      legacyMap
        .filter(
          (row) =>
            normalizeForMatch(row.oldProvince) ===
            normalizeForMatch(shortProvinceName(p.name)),
        )
        .map((row) => row.oldDistrict),
    ),
  ];
  const allOldWardNames = [...new Set(legacyMap.map((row) => row.oldWard))];
  let wardPart: string | undefined;
  let districtPart: string | undefined;
  const streetParts: string[] = [];
  for (const seg of unmatched) {
    // Tiền tố là tín hiệu mạnh nhất: phần ghi "phường/xã/p." là phường,
    // "quận/huyện/q." là quận cũ, "tỉnh/thành phố/tp." là tỉnh. Phân loại
    // theo tiền tố trước, để "q. hoàn kiếm" không bị nhận nhầm thành
    // phường "Hoàn Kiếm" (vừa là quận cũ vừa là phường mới) khi nó đứng
    // trước phần phường, và "Tỉnh Bình Dương" không bị nhận nhầm thành
    // phường cũ "Bình Dương" (xã cũ ở Quảng Ninh).
    const lowerSeg = seg.toLowerCase();
    // "Xa lộ" là tên đường (xa lộ Hà Nội), không phải tiền tố xã: loại
    // trừ trước khi xét tiền tố phường, nếu không phần đường "Xa lộ Hà
    // Nội" sẽ bị nhận nhầm thành phường.
    const isHighway = lowerSeg.startsWith('xa lộ') || lowerSeg.startsWith('xa lo');
    const isWardPrefixed =
      !isHighway &&
      (/^(phường|phuong|xã|xa|p\.)\s?/.test(lowerSeg) || /^p\s/.test(lowerSeg));
    const isDistrictPrefixed =
      /^(quận|quan|huyện|huyen|q\.)\s?/.test(lowerSeg) || /^q\s/.test(lowerSeg);
    const isProvincePrefixed =
      /^(tỉnh|tinh|thành phố|thanh pho|tp\.)\s?/.test(lowerSeg) ||
      /^tp\s/.test(lowerSeg);
    if (isProvincePrefixed) {
      // Tỉnh lạ hoặc không còn (ví dụ Bình Dương đã sáp nhập): không phải
      // phường, để lại làm đường để bước đề xuất ghi rõ.
      streetParts.push(seg);
      continue;
    }
    if (isDistrictPrefixed && !districtPart) {
      districtPart = seg;
      continue;
    }
    if (isWardPrefixed && !wardPart) {
      wardPart = seg;
      continue;
    }
    if (!wardPart && province) {
      // Phường hiện tại rồi tới phường cũ, khớp chặt (chính xác hoặc mờ).
      const ward = matchStrict(seg, wardNamesOf(province));
      if (ward.name) {
        wardPart = seg;
        if (ward.fuzzy) {
          notes.push(
            `Phần "${seg}" khớp mờ với phường "${ward.name}", cần kiểm tra lại.`,
          );
        }
        continue;
      }
      const oldWard = matchStrict(seg, oldWardNamesOf(province));
      if (oldWard.name) {
        wardPart = seg;
        if (oldWard.fuzzy) {
          notes.push(
            `Phần "${seg}" khớp mờ với phường cũ "${oldWard.name}", cần kiểm tra lại.`,
          );
        }
        continue;
      }
    }
    if (!wardPart && !province) {
      // Suy ra tỉnh từ phường chỉ được khi khớp CHÍNH XÁC: khớp mờ ở
      // phạm vi cả nước quá yếu (ví dụ "Bến Nghé" khớp mờ nhầm sang một
      // phường ở An Giang), suy ra sai tỉnh thì cả đề xuất sai theo.
      const currentHits = gazetteer.filter((p) =>
        matchExact(seg, wardNamesOf(p)),
      );
      if (currentHits.length === 1) {
        province = currentHits[0];
        wardPart = seg;
        notes.push(
          `Suy ra tỉnh "${shortProvinceName(province.name)}" từ phường "${seg}" vì phường này chỉ có ở tỉnh đó.`,
        );
        continue;
      }
      const exactOld = matchExact(seg, allOldWardNames);
      if (exactOld) {
        const oldRows = legacyMap.filter(
          (row) => normalizeForMatch(row.oldWard) === normalizeForMatch(exactOld),
        );
        const newProvinces = [...new Set(oldRows.map((row) => row.newProvince))];
        if (newProvinces.length === 1) {
          const inferred = gazetteer.find(
            (p) =>
              normalizeForMatch(p.name) ===
              normalizeForMatch(newProvinces[0]),
          );
          if (inferred) {
            province = inferred;
            wardPart = seg;
            notes.push(
              `Suy ra tỉnh "${shortProvinceName(province.name)}" từ phường cũ "${seg}" vì phường này chỉ về tỉnh đó.`,
            );
            continue;
          }
        }
      }
    }
    if (!districtPart && province) {
      const district = matchExact(seg, legacyDistrictsOf(province));
      if (district) {
        districtPart = seg;
        continue;
      }
    }
    streetParts.push(seg);
  }

  if (!province) {
    notes.push('Không nhận ra tỉnh trong chuỗi.');
  }
  if (province && !wardPart) {
    notes.push('Không nhận ra phường trong chuỗi.');
  }
  return {
    parts: {
      province: provincePart,
      ward: wardPart,
      district: districtPart,
      street: streetParts.join(', '),
    },
    notes,
  };
}

// ---------------------------------------------------------------------------
// Chấm điểm tin cậy (thang 40/40/20): tỉnh đúng 40, phường đúng 40,
// có đường 20; ngưỡng áp dụng MIN_ADDRESS_TRUST = 70. Chỉ chấm khớp
// chính xác sau chuẩn hóa; việc sửa lỗi gõ thuộc về thuật toán đề xuất
// (suggest), không thuộc về hàm chấm này.
// ---------------------------------------------------------------------------

// Mức tin cậy từ điểm số: >= 95 tin cậy cao, 70-94 cần lưu ý, < 70 rủi
// ro cao. Điểm đạt được chỉ có thể là 0/20/40/60/80/100 nên thực tế mức
// cao chỉ khi đủ 100, mức giữa chỉ khi 80.
export function addressLevelFor(trust: number): AddressEvaluation['level'] {
  return trust >= 95 ? 'Tin cậy cao' : trust >= 70 ? 'Cần lưu ý' : 'Rủi ro cao';
}

export function scoreAddress(
  province: string | undefined,
  ward: string | undefined,
  street: string | undefined,
  gazetteer: GazetteerProvince[],
): AddressEvaluation {
  const provinceKnown =
    !!province &&
    gazetteer.some((p) => normalizeForMatch(p.name) === normalizeForMatch(province));
  const matchedProvince = provinceKnown
    ? gazetteer.find((p) => normalizeForMatch(p.name) === normalizeForMatch(province!))
    : undefined;
  const wardKnown =
    !!ward &&
    !!matchedProvince &&
    matchedProvince.wards.some(
      (w) => normalizeForMatch(w.name) === normalizeForMatch(ward),
    );
  const hasStreet = !!street && street.trim().length > 0;
  const trust =
    (provinceKnown ? 40 : 0) + (wardKnown ? 40 : 0) + (hasStreet ? 20 : 0);
  return { trust, level: addressLevelFor(trust), provinceKnown, wardKnown: !!wardKnown, hasStreet };
}

// ---------------------------------------------------------------------------
// Đề xuất chuẩn hóa: nhận các phần địa chỉ thô (đã tách sẵn hoặc từ
// splitRawAddress), tra danh mục + bảng ánh xạ cũ -> mới, trả về địa chỉ
// đề xuất kèm lý do từng phần.
// ---------------------------------------------------------------------------

function findProvince(
  gazetteer: GazetteerProvince[],
  rawProvince: string,
): { province: GazetteerProvince | undefined; result: MatchResult } {
  const result = matchCandidate(
    rawProvince,
    gazetteer.map((p) => p.name),
  );
  const province = result.name
    ? gazetteer.find((p) => p.name === result.name)
    : undefined;
  return { province, result };
}

export function suggest(
  parts: AddressParts,
  gazetteer: GazetteerProvince[],
  legacyMap: LegacyWardMapping[],
): SuggestedAddress {
  const reasons: string[] = [];
  const ambiguous: string[] = [];
  let fuzzy = false;

  let province: GazetteerProvince | undefined;
  let provinceKnown = false;
  let wardName = '';
  let wardKnown = false;

  // 1. Tỉnh: khớp theo thang (chính xác -> mờ).
  if (parts.province) {
    const { province: found, result } = findProvince(gazetteer, parts.province);
    if (found) {
      province = found;
      provinceKnown = true;
      if (result.fuzzy) {
        fuzzy = true;
        reasons.push(
          `Tỉnh "${parts.province}" khớp mờ với "${shortProvinceName(found.name)}", cần kiểm tra lại.`,
        );
      } else {
        reasons.push(`Tỉnh "${shortProvinceName(found.name)}" đúng.`);
      }
    } else if (result.ambiguous) {
      ambiguous.push(`Phần tỉnh "${parts.province}" khớp nhiều tỉnh, không chọn được.`);
      reasons.push(`Tỉnh "${parts.province}" mơ hồ, cần ghi rõ.`);
    } else {
      reasons.push(`Không tra được tỉnh "${parts.province}" trong danh mục 34 tỉnh/thành.`);
    }
  } else {
    reasons.push('Chưa ghi tỉnh.');
  }

  // 2. Phường, theo thứ tự: khớp chính xác phường hiện tại -> tra bảng
  // ánh xạ phường cũ -> mới -> khớp mờ phường hiện tại. Thứ tự này quan
  // trọng: tên phường cũ hay là phần đầu của tên phường hiện tại khác
  // ("Trần Hưng Đạo" chứa "Hưng Đạo"), nếu khớp mờ trước sẽ nhận nhầm
  // phường khác thay vì tra bảng ánh xạ.
  // Nếu chưa có tỉnh mà phường chỉ có ở đúng 1 tỉnh trong cả nước thì
  // suy ra tỉnh từ phường (ví dụ "Phường Cửa Nam" chỉ có ở Hà Nội).
  const matchWardIn = (provinceToSearch: GazetteerProvince, rawWard: string) => {
    const result = matchCandidate(
      rawWard,
      provinceToSearch.wards.map((w) => w.name),
    );
    return { ward: result.name ?? undefined, result };
  };

  if (parts.ward) {
    if (province) {
      const exactWard = matchExact(parts.ward, province.wards.map((w) => w.name));
      if (exactWard) {
        wardName = exactWard;
        wardKnown = true;
        reasons.push(`Phường "${exactWard}" đúng.`);
      }
      let mapRowsFound = false;
      if (!wardKnown) {
        // 2a. Phường cũ -> mới: tên cũ phải khớp CHÍNH XÁC sau chuẩn hóa.
        // Khớp mờ ở đây sẽ nhận nhầm: tên phường hiện tại gõ sai ("Cửa
        // Nma") cũng gần với tên phường cũ cùng tên ("Cửa Nam"), mà phường
        // cũ Cửa Nam tách thành 4 phường mới, nên sẽ đề xuất sai phường.
        // Tên cũ gõ sai (hiếm, vì lỗi dấu đã mất khi chuẩn hóa) thì rơi về
        // nhập tay, không đoán mò.
        const normProvince = normalizeForMatch(shortProvinceName(province.name));
        const oldWardNames = [
          ...new Set(
            legacyMap
              .filter(
                (row) => normalizeForMatch(row.oldProvince) === normProvince,
              )
              .map((row) => row.oldWard),
          ),
        ];
        const resolvedOldName: string | null = matchExact(parts.ward, oldWardNames);
        const rowsForWard: LegacyWardMapping[] = resolvedOldName
          ? legacyMap.filter(
              (row) =>
                normalizeForMatch(row.oldWard) ===
                  normalizeForMatch(resolvedOldName) &&
                normalizeForMatch(row.oldProvince) === normProvince,
            )
          : [];
        let rows = rowsForWard;
        if (parts.district) {
          const withDistrict = rowsForWard.filter(
            (row) =>
              normalizeForMatch(row.oldDistrict) ===
              normalizeForMatch(parts.district!),
          );
          if (withDistrict.length > 0) rows = withDistrict;
        }
        mapRowsFound = rows.length > 0;
        const distinctNew = [...new Set(rows.map((r) => r.newWard))];
        const wardExists = (name: string) =>
          province!.wards.some(
            (w) => normalizeForMatch(w.name) === normalizeForMatch(name),
          );
        if (rows.length === 0) {
          // Không có dòng ánh xạ: có thể phường nhập vào không phải tên cũ
          // mà chỉ gõ sai, để bước khớp mờ phía dưới thử.
        } else if (distinctNew.length === 1 && wardExists(distinctNew[0])) {
          const form = rows[0].form;
          wardName = distinctNew[0];
          wardKnown = true;
          if (form === 'toan-bo') {
            reasons.push(
              `Phường cũ "${parts.ward}" đã sáp nhập toàn bộ thành "${wardName}".`,
            );
          } else {
            fuzzy = true;
            reasons.push(
              `Phường cũ "${parts.ward}" đã tách, phần chủ yếu về "${wardName}": cần xác minh thêm.`,
            );
          }
        } else if (distinctNew.length > 1) {
          const main = rows.filter((r) => r.form === 'chu-yeu');
          const mainWards = [...new Set(main.map((r) => r.newWard))];
          if (mainWards.length === 1 && wardExists(mainWards[0])) {
            wardName = mainWards[0];
            wardKnown = true;
            fuzzy = true;
            reasons.push(
              `Phường cũ "${parts.ward}" đã tách thành nhiều phường mới (${distinctNew.join(', ')}); đề xuất phần chủ yếu "${wardName}", cần xác minh thêm.`,
            );
          } else {
            ambiguous.push(
              `Phường cũ "${parts.ward}" tách thành nhiều phường mới: ${distinctNew.join(', ')}.`,
            );
            reasons.push(
              `Phường cũ "${parts.ward}" tách thành nhiều phường mới (${distinctNew.join(', ')}), cần xác minh thêm, chưa đề xuất được.`,
            );
          }
        } else {
          reasons.push(
            `Bảng ánh xạ ghi phường mới "${distinctNew[0]}" nhưng danh mục không có phường này, cần kiểm tra lại dữ liệu.`,
          );
        }
      }
      if (!wardKnown) {
        // 2b. Khớp mờ phường hiện tại, chỉ khi không phải phường cũ.
        const { ward, result } = matchWardIn(province, parts.ward);
        if (ward) {
          wardName = ward;
          wardKnown = true;
          fuzzy = true;
          reasons.push(
            `Phường "${parts.ward}" khớp mờ với "${ward}", cần kiểm tra lại.`,
          );
        }
      }
      if (!wardKnown && !mapRowsFound) {
        reasons.push(
          `Phường "${parts.ward}" không có trong danh mục tỉnh "${shortProvinceName(province.name)}" và không tra được trong bảng ánh xạ, nhập tay.`,
        );
      }
    } else {
      const exactMatches = gazetteer
        .map((p) => ({
          province: p,
          ward: matchExact(parts.ward!, p.wards.map((w) => w.name)),
        }))
        .filter((m) => m.ward);
      if (exactMatches.length === 1) {
        province = exactMatches[0].province;
        provinceKnown = true;
        wardName = exactMatches[0].ward!;
        wardKnown = true;
        reasons.push(
          `Suy ra tỉnh "${shortProvinceName(province.name)}" từ phường "${wardName}" vì phường này chỉ có ở tỉnh đó.`,
        );
      } else if (exactMatches.length > 1) {
        ambiguous.push(
          `Phường "${parts.ward}" có ở nhiều tỉnh (${exactMatches.map((m) => shortProvinceName(m.province.name)).join(', ')}), cần ghi rõ tỉnh.`,
        );
        reasons.push(`Phường "${parts.ward}" có ở nhiều tỉnh, cần ghi rõ tỉnh.`);
      } else {
        reasons.push(
          `Chưa xác định được tỉnh nên chưa tra được phường "${parts.ward}".`,
        );
      }
    }
  } else {
    reasons.push('Chưa ghi phường.');
  }

  // 4. Gợi ý từ đường: khi phường vẫn chưa biết mà trong phần đường có
  // đúng 1 tên phường hiện tại của tỉnh đó, dùng nó để sửa phường
  // sai/thiếu. Tên phường phải xuất hiện như một cụm từ độc lập (đầu
  // chuỗi hoặc sau từ chỉ loại đường/địa chỉ như phố, đường, ngõ, phường),
  // không phải đuôi của tên dài hơn ("Trần Hưng Đạo" chứa "Hưng Đạo"
  // nhưng "Trần" không phải từ chỉ loại, nên không gợi ý). Không bao giờ
  // ghi đè phường đã đúng.
  const GENERIC_ADDRESS_WORDS = new Set([
    'so', 'pho', 'duong', 'ngo', 'ngach', 'hem', 'phuong', 'xa', 'quan',
    'huyen', 'tinh', 'thanh', 'ap', 'khu', 'thon', 'xom', 'toa', 'can',
  ]);
  if (province && !wardKnown && parts.street) {
    const words = normalizeForMatch(parts.street)
      .split(' ')
      .filter((w) => w.length > 0);
    const hinted = province.wards.filter((w) => {
      const keyWords = normalizeForMatch(w.name)
        .split(' ')
        .filter((x) => x.length > 0);
      if (keyWords.length === 0) return false;
      for (let i = 0; i + keyWords.length <= words.length; i++) {
        let ok = true;
        for (let j = 0; j < keyWords.length; j++) {
          if (words[i + j] !== keyWords[j]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (i === 0 || GENERIC_ADDRESS_WORDS.has(words[i - 1])) return true;
      }
      return false;
    });
    if (hinted.length === 1) {
      wardName = hinted[0].name;
      wardKnown = true;
      fuzzy = true;
      reasons.push(
        `Đường ghi "${parts.street}" nhắc tới phường "${wardName}", dùng để sửa phường.`,
      );
    } else if (hinted.length > 1) {
      ambiguous.push(
        `Trong đường nhắc tới nhiều phường: ${hinted.map((w) => w.name).join(', ')}.`,
      );
    }
  }

  // 5. Đường: giữ nguyên chữ gốc, chỉ gọn khoảng trắng. Có đường thì
  // được 20 điểm, không kiểm tra đường có tồn tại thật hay không (danh
  // mục GSO không có danh sách đường).
  const street = parts.street.trim().replace(/\s+/g, ' ');
  const hasStreet = street.length > 0;
  if (hasStreet) {
    reasons.push('Có địa chỉ đường.');
  } else {
    reasons.push('Chưa ghi địa chỉ đường.');
  }

  const result: SuggestedAddress = {
    province: province ? shortProvinceName(province.name) : '',
    ward: wardName,
    street,
    district: parts.district,
    provinceKnown,
    wardKnown,
    hasStreet,
    reasons,
    fuzzy,
    ambiguous,
  };
  if (provinceKnown && !wardKnown && province) {
    result.choices = { wards: province.wards.map((w) => w.name) };
  }
  return result;
}
