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
  SplitError,
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

// Các tỉnh có phường tên này (khớp chính xác sau chuẩn hóa). Dùng để
// đối chiếu tỉnh do LLM đoán với dữ liệu hành chính: tỉnh chỉ được nhận
// khi phường buộc ra đúng 1 tỉnh trong danh mục.
export function provincesContainingWard(
  wardName: string,
  gazetteer: GazetteerProvince[],
): GazetteerProvince[] {
  const key = normalizeForMatch(wardName);
  if (!key) return [];
  return gazetteer.filter((p) =>
    p.wards.some((w) => normalizeForMatch(w.name) === key),
  );
}

// Khớp phường theo chữ cái đầu (viết tắt): ví dụ "p. HK" -> "Hoàn Kiếm".
// Chỉ dùng khi phần phường rất ngắn (<= 3 ký tự sau chuẩn hóa) và không
// khớp bằng cách nào khác (chính xác, bảng ánh xạ, khớp mờ). Chữ cái đầu
// là ký tự đầu mỗi từ của tên phường sau chuẩn hóa (bỏ tiền tố phường/xã).
// Chỉ nhận khi duy nhất 1 phường trong danh sách có chữ cái đầu trùng
// khớp; trùng nhiều phường thì mơ hồ, không chọn.
export function matchWardByInitials(
  rawWard: string,
  wardNames: string[],
): { name: string | null; ambiguous: boolean } {
  const key = normalizeForMatch(rawWard).replace(/[^a-z]/g, '');
  if (!key || key.length > 3) return { name: null, ambiguous: false };
  const initialsOf = (name: string): string =>
    normalizeForMatch(name)
      .split(' ')
      .filter((w) => w.length > 0 && /^[a-z]/.test(w))
      .map((w) => w[0])
      .join('');
  const matches = wardNames.filter((name) => initialsOf(name) === key);
  if (matches.length === 1) return { name: matches[0], ambiguous: false };
  if (matches.length > 1) return { name: null, ambiguous: true };
  return { name: null, ambiguous: false };
}

// Một phần mang tiền tố phường/xã/quận/huyện thì không bao giờ là tỉnh
// (ví dụ "Phường Láng Tròn" khớp mờ thành tỉnh "Lạng Sơn" nếu cứ thử
// khớp tỉnh). "Xa lộ" là tên đường, không phải tiền tố xã.
function hasWardOrDistrictPrefix(seg: string): boolean {
  const lowerSeg = seg.toLowerCase();
  if (lowerSeg.startsWith('xa lộ') || lowerSeg.startsWith('xa lo')) {
    return false;
  }
  const isWardPrefixed =
    /^(phường|phuong|xã|xa|p\.)\s?/.test(lowerSeg) || /^p\s/.test(lowerSeg);
  const isDistrictPrefixed =
    /^(quận|quan|huyện|huyen|q\.)\s?/.test(lowerSeg) || /^q\s/.test(lowerSeg);
  return isWardPrefixed || isDistrictPrefixed;
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
  let provincePartIndex = -1;
  let province: GazetteerProvince | undefined;
  const unmatched: string[] = [];

  // Lượt 1: tìm tỉnh trước (theo nội dung, không theo vị trí), phần còn
  // lại để sang lượt sau. Phần mang tiền tố phường/quận không thử khớp
  // tỉnh (xem hasWardOrDistrictPrefix); phần mang tiền tố tỉnh (tỉnh/
  // tp.) và phần không tiền tố vẫn khớp tỉnh như thường.
  // Nếu chuỗi nhắc tới 2 tỉnh khác nhau thì chọn theo 2 tiêu chí, theo
  // thứ tự: (1) tỉnh nào có phường/quận trùng với các phần còn lại trong
  // chuỗi thì ưu tiên (đối chiếu phường và tên đường); (2) hòa nhau thì
  // lấy tỉnh bên phải nhất (tỉnh thường đứng cuối địa chỉ).
  const provinceCandidates: {
    name: string;
    seg: string;
    fuzzy: boolean;
    index: number;
  }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (hasWardOrDistrictPrefix(seg)) continue;
    const match = matchCandidate(seg, provinceNames);
    if (match.name && !match.ambiguous) {
      provinceCandidates.push({ name: match.name, seg, fuzzy: match.fuzzy, index: i });
    }
  }
  const distinctProvinces = [...new Set(provinceCandidates.map((c) => c.name))];
  if (distinctProvinces.length === 1) {
    const first = provinceCandidates[0];
    province = gazetteer.find((p) => p.name === first.name);
    provincePart = first.seg;
    provincePartIndex = first.index;
    if (first.fuzzy) {
      notes.push(
        `Phần "${first.seg}" khớp tỉnh bằng khớp mờ, cần kiểm tra lại.`,
      );
    }
  } else if (distinctProvinces.length > 1) {
    // Nhiều tỉnh: chấm điểm từng tỉnh bằng số phần còn lại trùng với
    // phường hoặc quận cũ của tỉnh đó, rồi lấy điểm cao nhất; hòa thì
    // lấy tỉnh bên phải nhất.
    const provinceSegIndexes = new Set(provinceCandidates.map((c) => c.index));
    const otherSegs = segments.filter((_, i) => !provinceSegIndexes.has(i));
    const scored = distinctProvinces.map((name) => {
      const prov = gazetteer.find((p) => p.name === name)!;
      const wardNames = prov.wards.map((w) => w.name);
      const provinceRows = legacyMap.filter(
        (row) =>
          normalizeForMatch(row.oldProvince) ===
          normalizeForMatch(shortProvinceName(prov.name)),
      );
      const oldWardNames = provinceRows.map((row) => row.oldWard);
      const districtNames = [...new Set(provinceRows.map((row) => row.oldDistrict))];
      let support = 0;
      for (const seg of otherSegs) {
        if (
          matchExact(seg, wardNames) ||
          matchExact(seg, oldWardNames) ||
          matchExact(seg, districtNames)
        ) {
          support += 1;
        }
      }
      const lastIndex = Math.max(
        ...provinceCandidates.filter((c) => c.name === name).map((c) => c.index),
      );
      return { name, support, lastIndex };
    });
    scored.sort((a, b) => b.support - a.support || b.lastIndex - a.lastIndex);
    const chosen = scored[0];
    const chosenCandidate = provinceCandidates.find(
      (c) => c.name === chosen.name,
    )!;
    province = gazetteer.find((p) => p.name === chosen.name);
    provincePart = chosenCandidate.seg;
    provincePartIndex = chosenCandidate.index;
    const provinceList = distinctProvinces
      .map((n) => shortProvinceName(n))
      .join(', ');
    if (chosen.support > 0) {
      notes.push(
        `Chuỗi nhắc tới nhiều tỉnh (${provinceList}), chọn "${shortProvinceName(chosen.name)}" vì phường/quận trong chuỗi thuộc tỉnh này.`,
      );
    } else {
      notes.push(
        `Chuỗi nhắc tới nhiều tỉnh (${provinceList}), chọn tỉnh bên phải nhất "${shortProvinceName(chosen.name)}", cần kiểm tra lại.`,
      );
    }
    if (chosenCandidate.fuzzy) {
      notes.push(
        `Phần "${chosenCandidate.seg}" khớp tỉnh bằng khớp mờ, cần kiểm tra lại.`,
      );
    }
  }
  for (let i = 0; i < segments.length; i++) {
    if (i !== provincePartIndex) unmatched.push(segments[i]);
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
      // Tỉnh lạ hoặc không còn (ví dụ Bình Dương đã sáp nhập): giữ lại
      // làm phần tỉnh để bước đề xuất báo lỗi phân tách (tỉnh không tra
      // được), thay vì để vào đường làm mất dấu vết. Nhưng "Tỉnh lộ ..."
      // là tên đường (tỉnh lộ + số), không phải tỉnh: vẫn để vào đường.
      const remainder = normalizeForMatch(seg);
      const looksLikeRoad =
        remainder.startsWith('lo ') || remainder === 'lo' || /\d/.test(remainder);
      if (!looksLikeRoad && remainder.length > 0 && !provincePart) {
        provincePart = seg;
        continue;
      }
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

  // Dấu vết để tính lỗi phân tách ở cuối: tỉnh mơ hồ, phường mơ hồ
  // (lý do cụ thể), bảng ánh xạ chỉ tới phường không có trong danh mục.
  // Lỗi chỉ tính khi phần đó vẫn chưa xác định được sau mọi cách khớp.
  let provinceAmbiguous = false;
  let wardAmbiguousMessage: string | undefined;
  let legacyDataError = false;

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
      provinceAmbiguous = true;
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
            wardAmbiguousMessage = `Phường cũ "${parts.ward}" tách thành nhiều phường mới: ${distinctNew.join(', ')}.`;
            ambiguous.push(wardAmbiguousMessage);
            reasons.push(
              `Phường cũ "${parts.ward}" tách thành nhiều phường mới (${distinctNew.join(', ')}), cần xác minh thêm, chưa đề xuất được.`,
            );
          }
        } else {
          legacyDataError = true;
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
      if (!wardKnown) {
        // 2c. Viết tắt theo chữ cái đầu (ví dụ "p. HK" -> "Hoàn Kiếm"):
        // chỉ khi phần phường rất ngắn (<= 3 ký tự sau chuẩn hóa) và
        // không khớp bằng cách nào khác. Chỉ nhận khi duy nhất 1 phường
        // trong tỉnh có chữ cái đầu trùng khớp; trùng nhiều phường thì
        // mơ hồ, không chọn.
        const initials = matchWardByInitials(
          parts.ward,
          province.wards.map((w) => w.name),
        );
        if (initials.name) {
          wardName = initials.name;
          wardKnown = true;
          fuzzy = true;
          reasons.push(
            `Phường "${parts.ward}" viết tắt, chữ cái đầu trùng duy nhất với "${wardName}", cần kiểm tra lại.`,
          );
        } else if (initials.ambiguous) {
          wardAmbiguousMessage = `Chữ cái đầu "${parts.ward}" trùng nhiều phường trong tỉnh "${shortProvinceName(province.name)}", cần ghi rõ.`;
          ambiguous.push(wardAmbiguousMessage);
          reasons.push(wardAmbiguousMessage);
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
        wardAmbiguousMessage = `Phường "${parts.ward}" có ở nhiều tỉnh (${exactMatches.map((m) => shortProvinceName(m.province.name)).join(', ')}), cần ghi rõ tỉnh.`;
        ambiguous.push(wardAmbiguousMessage);
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

  // 4. Gợi ý từ đường: CHỈ khi phường đang thiếu hẳn (người dùng không
  // ghi phường) mà trong phần đường có đúng 1 tên phường hiện tại của
  // tỉnh đó thì dùng nó để điền phường. Phường đã ghi rõ thì không bao
  // giờ thay bằng phường khác từ đường: phường ghi rõ mà không có trong
  // tỉnh là lỗi phân tách, để người dùng tự hiệu chỉnh. Tên phường phải
  // xuất hiện như một cụm từ độc lập (đầu chuỗi hoặc sau từ chỉ loại
  // đường/địa chỉ như phố, đường, ngõ, phường), không phải đuôi của tên
  // dài hơn ("Trần Hưng Đạo" chứa "Hưng Đạo" nhưng "Trần" không phải từ
  // chỉ loại, nên không gợi ý). Không bao giờ ghi đè phường đã đúng.
  const GENERIC_ADDRESS_WORDS = new Set([
    'so', 'pho', 'duong', 'ngo', 'ngach', 'hem', 'phuong', 'xa', 'quan',
    'huyen', 'tinh', 'thanh', 'ap', 'khu', 'thon', 'xom', 'toa', 'can',
  ]);
  if (province && !wardKnown && !parts.ward && parts.street) {
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

  // Lỗi phân tách: chỉ tính khi phần đó vẫn chưa xác định được sau mọi
  // cách khớp. Hệ thống không đoán: màn hình đưa đơn vào phần Lỗi phân
  // tách để người dùng tự hiệu chỉnh. Thứ tự ưu tiên: phường mơ hồ, rồi
  // tỉnh không tra được, rồi phường không tra được.
  let splitError: SplitError | undefined;
  if (parts.ward && !wardKnown && wardAmbiguousMessage) {
    splitError = { code: 'ambiguous-ward', message: wardAmbiguousMessage };
  } else if (parts.province && !provinceKnown) {
    splitError = {
      code: 'province-not-found',
      message: provinceAmbiguous
        ? `Tỉnh "${parts.province}" mơ hồ, cần ghi rõ.`
        : `Không tra được tỉnh "${parts.province}" trong danh mục 34 tỉnh/thành.`,
    };
  } else if (parts.ward && !wardKnown) {
    if (legacyDataError) {
      splitError = {
        code: 'ward-not-found',
        message:
          'Bảng ánh xạ ghi phường mới nhưng danh mục không có phường này, cần kiểm tra lại dữ liệu.',
      };
    } else if (province) {
      splitError = {
        code: 'ward-not-in-province',
        message: `Phường "${parts.ward}" không có trong tỉnh "${shortProvinceName(province.name)}", kiểm tra lại tên phường hoặc tỉnh.`,
      };
    } else {
      splitError = {
        code: 'ward-not-found',
        message: `Không xác định được phường "${parts.ward}", cần ghi rõ tỉnh hoặc kiểm tra lại tên phường.`,
      };
    }
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
    splitError,
  };
  if (provinceKnown && !wardKnown && province) {
    result.choices = { wards: province.wards.map((w) => w.name) };
  }
  return result;
}
