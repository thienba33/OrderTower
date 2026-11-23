// SPDX-License-Identifier: Apache-2.0
// Sinh dữ liệu mẫu M3 cho OrderTower: khoảng 40 SKU, khoảng 120 đơn
// (8 đơn demo hiện có + 112 đơn lịch sử), lịch sử bán 28 ngày theo thời
// gian, đơn hoàn mẫu kèm kênh và lý do, rồi đóng băng snapshot.
//
// Chạy 1 lần, kiểm tra tổng số và phân bố, rồi commit kết quả:
//   node scripts/generate-sample-data.mjs
// Chỉ sinh ra thư mục tạm để kiểm tra tính xác định (test dùng cách này):
//   node scripts/generate-sample-data.mjs --out /tmp/kiem-tra-seed
//
// Mọi lựa chọn ngẫu nhiên đều từ PRNG xác định mulberry32 với seed cố
// định 20261123, nên chạy 2 lần ra đúng 1 kết quả byte giống nhau.
// Không đọc, không ghi secret nào; chỉ ghi 2 tệp JSON dữ liệu mẫu.
//
// Quy ước dữ liệu (xem thêm services/api/src/seed/data/README.md):
// - Cửa sổ lịch sử 28 ngày: 26/10/2026 tới 22/11/2026. Mọi thời điểm
//   sinh ra đều không vượt quá 23/11/2026 00:00 UTC, tức không có bản ghi
//   nào mang thời gian tương lai so với lúc nạp seed.
// - Đơn lịch sử dùng mã LS-1001 trở đi (LS = lịch sử), không dùng mã DH
//   để khỏi làm lệch bộ đếm đơn tạo tay DH-1009 của 8 đơn demo.
// - SKU NM-40 không xuất hiện trong bất kỳ đơn nào: kiểm thử tích hợp đo
//   tồn NM-40 sau khi nạp seed (452, giữ 0).
// - Tồn kho trong inventory.seed.json là tồn kho ĐẦU KỲ (trước khi nạp
//   đơn mẫu): tồn kho khả dụng sau khi nạp seed = stock - tổng lượng đã
//   giữ cho đơn mẫu. 11 SKU gốc giữ nguyên tồn kho khả dụng sau seed như
//   dữ liệu đóng băng 02/11/2026 (NM-25 486, NM-40 452, HS-KHO 304...).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERATOR_SEED = 20261123;
const WINDOW_START = Date.parse('2026-10-26T02:00:00.000Z');
const SEED_RUN_CAP = Date.parse('2026-11-23T00:00:00.000Z');
const HISTORICAL_COUNT = 112;

// Phân bố 9 trạng thái cho 112 đơn lịch sử. Đang giao tối đa 5 vì chỉ có
// 5 tài xế và 5 xe: đơn ở Đang giao giữ 1 tài xế và 1 xe tới khi giao xong.
const STATE_QUOTAS = {
  Hoàn: 63,
  'Đã giao': 8,
  'Đang giao': 5,
  'Chờ điều xe': 8,
  'Đang đóng gói': 8,
  'Chờ kho': 8,
  'Đã kiểm tra': 5,
  'Mới tạo': 4,
  Hủy: 3,
};

// Giờ lệch tối đa sau thời điểm tạo đơn cho từng trạng thái đích (xem bảng
// lệch trong HistoricalSeedService): đơn càng về cuối luồng thì cần càng
// nhiều thời gian, nên ngày tạo đơn bị giới hạn để không vượt quá mốc chạy.
const MAX_OFFSET_HOURS = {
  'Mới tạo': 0,
  'Đã kiểm tra': 1,
  'Chờ kho': 3,
  'Đang đóng gói': 5,
  'Chờ điều xe': 30,
  'Đang giao': 26,
  'Đã giao': 31,
  Hoàn: 58,
  Hủy: 4,
};

const CHANNELS = [
  { id: 'K-1001', name: 'Chat', weight: 40 },
  { id: 'K-1002', name: 'Web', weight: 35 },
  { id: 'K-1003', name: 'Điện thoại', weight: 25 },
];

const ADDRESSES = [
  {
    province: 'Hà Nội',
    district: 'Hai Bà Trưng',
    ward: 'Phường Phạm Đình Hổ',
    streets: ['phố Hàng Bè', 'phố Huế', 'phố Bạch Mai'],
  },
  {
    province: 'Hà Nội',
    district: 'Hoàn Kiếm',
    ward: 'Phường Trần Hưng Đạo',
    streets: ['phố Trần Hưng Đạo', 'phố Hàng Bài', 'phố Lý Thường Kiệt'],
  },
  {
    province: 'Hà Nội',
    district: 'Đông Anh',
    ward: 'Xã Đông Anh',
    streets: ['phố Cao Lỗ', 'đường 23B'],
  },
  {
    province: 'Hà Nội',
    district: 'Đống Đa',
    ward: 'Phường Láng Hạ',
    streets: ['phố Láng Hạ', 'phố Thái Hà'],
  },
  {
    province: 'Hải Phòng',
    district: 'Hồng Bàng',
    ward: 'Phường Hoàng Văn Thụ',
    streets: ['phố Hoàng Văn Thụ', 'phố Quang Trung'],
  },
  {
    province: 'Quảng Ninh',
    district: 'Hạ Long',
    ward: 'Phường Bãi Cháy',
    streets: ['phố Bãi Cháy', 'đường Hạ Long'],
  },
];

// Địa chỉ tin cậy thấp (chỉ tỉnh đúng 40 + địa chỉ chi tiết 10 = 50),
// chỉ dùng cho đơn còn ở Mới tạo hoặc Đã kiểm tra vì rào chắn địa chỉ
// chặn đơn tin cậy dưới 70 đi tiếp tới Chờ kho.
const LOW_TRUST_ADDRESS = {
  province: 'Hà Nội',
  district: 'Quận Không Có',
  ward: 'Phường Không Có',
  street: 'Số 12 ngõ 34 phố Hàng Bè',
};

const CUSTOMERS = [
  'Hộ nước mắm An',
  'Quán ăn Bình',
  'Siêu thị mini Cường',
  'Nhà hàng Dũng',
  'Cửa hàng tạp hóa Hà',
  'Hộ kinh doanh Khánh',
  'Quán cơm Linh',
  'Siêu thị Minh',
  'Nhà hàng Ngọc',
  'Cửa hàng Phúc',
  'Hộ nước mắm Quân',
  'Quán ăn Sơn',
  'Siêu thị mini Trang',
  'Nhà hàng Vinh',
  'Cửa hàng tạp hóa Yến',
  'Hộ kinh doanh Đạt',
  'Quán cơm Hương',
  'Siêu thị Lan',
  'Nhà hàng Mai',
  'Cửa hàng Nam',
  'Hộ nước mắm Oanh',
  'Quán ăn Phong',
  'Siêu thị mini Thảo',
  'Nhà hàng Tuấn',
  'Cửa hàng tạp hóa Vân',
  'Hộ kinh doanh Xuân',
  'Quán cơm Bảo',
  'Siêu thị Hạnh',
  'Nhà hàng Kiên',
  'Cửa hàng tạp hóa Tâm',
];

const RETURN_REASONS = [
  'Hàng bị vỡ khi vận chuyển',
  'Giao sai sản phẩm',
  'Khách đổi ý không nhận',
  'Sản phẩm có mùi lạ',
  'Bao bì rách',
  'Giao thiếu số lượng',
  'Khách đặt trùng đơn',
  'Hàng giao chậm quá hẹn',
];

const CANCEL_REASONS = [
  'Khách hủy trước khi giao',
  'Khách đặt trùng đơn',
  'Không liên lạc được với khách',
];

const CLOSE_HANDLINGS = [
  'Đã giao đủ, đối soát xong.',
  'Giao đủ hàng, khách đã nhận.',
];

// Danh mục 40 SKU. 11 SKU đầu giữ nguyên tên, đơn vị và giá (kể cả 7 SKU
// chưa có giá) như dữ liệu đóng băng 02/11/2026. 29 SKU mới đều có giá:
// giá tham khảo thị trường bán lẻ cho hộ nước mắm, hải sản khô và phụ
// kiện điện thoại, ghi rõ ở đây để lớp BI tính được doanh thu.
// weight: trọng số chọn SKU khi sinh đơn (NM-40 bằng 0, xem ghi chú đầu
// tệp). lowStock: 10 SKU ứng viên tồn kho sắp hết; sau khi sinh, 7 SKU
// có tốc độ bán 7 ngày cuối cao nhất trong nhóm này được đặt tồn kho
// cuối kỳ chỉ còn 2-5 ngày bán (mục 3 bản dự thảo BI pilot).
// spike: SKU thiết kế cầu tăng đột biến 7 ngày cuối (mục 3 bản dự thảo):
// trọng số gốc đã cao, lại nhân 3 trong 7 ngày cuối.
const CATALOG = [
  { sku: 'NM-25', name: 'Nước mắm 25 độ 500ml', unit: 'chai', unitPrice: 93000, weight: 12, finalStock: 486 },
  { sku: 'NM-40', name: 'Nước mắm 40 độ 500ml', unit: 'chai', unitPrice: 142000, weight: 0, finalStock: 452 },
  { sku: 'HS-KHO', name: 'Hải sản khô 500g', unit: 'gói', unitPrice: 105000, weight: 10, finalStock: 304 },
  { sku: 'NM-15', name: 'Nước mắm 15 độ 500ml', unit: 'chai', unitPrice: 64000, weight: 9, finalStock: 398 },
  { sku: 'MT-08', name: 'Mắm tôm 250g', unit: 'hũ', unitPrice: null, weight: 4, finalStock: 87 },
  { sku: 'CK-03', name: 'Cá khô 300g', unit: 'gói', unitPrice: null, weight: 5, finalStock: 324 },
  { sku: 'NM-30', name: 'Nước mắm 30 độ 500ml', unit: 'chai', unitPrice: null, weight: 5, finalStock: 251 },
  { sku: 'NM-45', name: 'Nước mắm 45 độ 500ml', unit: 'chai', unitPrice: null, weight: 3, finalStock: 91 },
  { sku: 'MT-12', name: 'Mắm tôm 500g', unit: 'hũ', unitPrice: null, weight: 3, finalStock: 93 },
  { sku: 'HS-MUC', name: 'Mực khô 200g', unit: 'gói', unitPrice: null, weight: 4, finalStock: 89 },
  { sku: 'CK-07', name: 'Cá khô 500g', unit: 'gói', unitPrice: null, weight: 4, finalStock: 106 },
  { sku: 'NM-10', name: 'Nước mắm 10 độ 500ml', unit: 'chai', unitPrice: 45000, weight: 7, lowStock: true },
  { sku: 'NM-20', name: 'Nước mắm 20 độ 500ml', unit: 'chai', unitPrice: 78000, weight: 9, lowStock: true },
  { sku: 'NM-35', name: 'Nước mắm 35 độ 500ml', unit: 'chai', unitPrice: 118000, weight: 22, spike: true, lowStock: true },
  { sku: 'NM-50', name: 'Nước mắm 50 độ 500ml', unit: 'chai', unitPrice: 168000, weight: 5, lowStock: true },
  { sku: 'NM-60', name: 'Nước mắm 60 độ 250ml', unit: 'chai', unitPrice: 195000, weight: 3 },
  { sku: 'NM-1L', name: 'Nước mắm 25 độ 1 lít', unit: 'chai', unitPrice: 165000, weight: 5, lowStock: true },
  { sku: 'NM-5L', name: 'Nước mắm 25 độ 5 lít', unit: 'can', unitPrice: 720000, weight: 3 },
  { sku: 'NM-CA', name: 'Nước mắm cá cơm 500ml', unit: 'chai', unitPrice: 135000, weight: 8, lowStock: true },
  { sku: 'NM-RUOC', name: 'Mắm ruốc 300g', unit: 'hũ', unitPrice: 58000, weight: 4, lowStock: true },
  { sku: 'NM-NEM', name: 'Mắm nêm 400g', unit: 'hũ', unitPrice: 42000, weight: 4 },
  { sku: 'HS-TOM', name: 'Tôm khô 200g', unit: 'gói', unitPrice: 245000, weight: 8, lowStock: true },
  { sku: 'HS-MUC-500', name: 'Mực khô 500g', unit: 'gói', unitPrice: 320000, weight: 6, lowStock: true },
  { sku: 'HS-CA-1KG', name: 'Cá khô 1kg', unit: 'gói', unitPrice: 210000, weight: 6, lowStock: true },
  { sku: 'HS-CA-THU', name: 'Cá thu khô 500g', unit: 'gói', unitPrice: 185000, weight: 4 },
  { sku: 'HS-BACH', name: 'Bạch tuộc khô 300g', unit: 'gói', unitPrice: 275000, weight: 3 },
  { sku: 'HS-SO', name: 'Sò khô 300g', unit: 'gói', unitPrice: 165000, weight: 3 },
  { sku: 'HS-HAU', name: 'Hàu khô 200g', unit: 'gói', unitPrice: 195000, weight: 3 },
  { sku: 'HS-RONG', name: 'Rong biển khô 100g', unit: 'gói', unitPrice: 85000, weight: 3 },
  { sku: 'MT-1K', name: 'Mắm tôm 1kg', unit: 'hũ', unitPrice: 120000, weight: 3 },
  { sku: 'CK-12', name: 'Cá cơm khô 500g', unit: 'gói', unitPrice: 95000, weight: 4 },
  { sku: 'DT-OP', name: 'Ốp lưng điện thoại', unit: 'cái', unitPrice: 89000, weight: 2 },
  { sku: 'DT-CL', name: 'Cường lực', unit: 'miếng', unitPrice: 59000, weight: 2 },
  { sku: 'DT-SAC', name: 'Sạc nhanh 25W', unit: 'cái', unitPrice: 189000, weight: 2 },
  { sku: 'DT-CAP', name: 'Cáp USB-C 1m', unit: 'cái', unitPrice: 79000, weight: 2 },
  { sku: 'DT-TAI', name: 'Tai nghe có dây', unit: 'cái', unitPrice: 149000, weight: 2 },
  { sku: 'DT-PIN', name: 'Sạc dự phòng 10000mAh', unit: 'cái', unitPrice: 349000, weight: 1 },
  { sku: 'DT-LOA', name: 'Loa bluetooth mini', unit: 'cái', unitPrice: 259000, weight: 1 },
  { sku: 'DT-GAY', name: 'Gậy selfie', unit: 'cái', unitPrice: 129000, weight: 1 },
  { sku: 'DT-CHU', name: 'Chuột không dây', unit: 'cái', unitPrice: 199000, weight: 1 },
];

// Lượng hàng 8 đơn demo đã giữ (xem orders.seed.json): DH-1007 giữ 2
// NM-25, DH-1008 giữ 2 HS-KHO. Cộng vào tổng giữ khi tính tồn kho đầu kỳ.
const DEMO_RESERVED = { 'NM-25': 2, 'HS-KHO': 2 };

// Trạng thái đã qua đóng gói thì kho đã giữ hàng.
const RESERVED_STATES = new Set([
  'Đang đóng gói',
  'Chờ điều xe',
  'Đang giao',
  'Đã giao',
  'Hoàn',
]);

// Trạng thái đã giao hàng (tính doanh số bán cho lớp BI).
const DELIVERED_STATES = new Set(['Đã giao', 'Hoàn']);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function dayStart(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function pickWeighted(random, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry;
    }
  }
  return entries[entries.length - 1];
}

function shuffle(random, list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generate() {
  const random = mulberry32(GENERATOR_SEED);
  const bySku = new Map(CATALOG.map((item) => [item.sku, item]));
  const spikeSku = CATALOG.find((item) => item.spike).sku;
  const last7Start = Date.parse('2026-11-16T00:00:00.000Z');
  const prev7Start = Date.parse('2026-11-09T00:00:00.000Z');

  // Danh sách trạng thái đích đúng phân bố, xáo trộn xác định.
  const states = [];
  for (const [state, count] of Object.entries(STATE_QUOTAS)) {
    for (let i = 0; i < count; i += 1) {
      states.push(state);
    }
  }
  const shuffledStates = shuffle(random, states);

  // 3 đơn tin cậy thấp, chỉ ở Mới tạo hoặc Đã kiểm tra.
  const lowTrustIndexes = new Set();
  const earlyIndexes = shuffledStates
    .map((state, index) => ({ state, index }))
    .filter((entry) => entry.state === 'Mới tạo' || entry.state === 'Đã kiểm tra')
    .map((entry) => entry.index);
  for (const index of shuffle(random, earlyIndexes).slice(0, 3)) {
    lowTrustIndexes.add(index);
  }

  // 2 đơn Chờ điều xe từng giao thất bại 1 lần rồi quay lại.
  const failedIndexes = new Set();
  const dispatchable = shuffledStates
    .map((state, index) => ({ state, index }))
    .filter((entry) => entry.state === 'Chờ điều xe')
    .map((entry) => entry.index);
  for (const index of shuffle(random, dispatchable).slice(0, 2)) {
    failedIndexes.add(index);
  }

  const orders = shuffledStates.map((targetState, index) => {
    const maxOffsetMs = MAX_OFFSET_HOURS[targetState] * 60 * 60 * 1000;
    const latestCreatedAt = SEED_RUN_CAP - maxOffsetMs;
    // Ngày tạo đơn lệch về cuối cửa sổ (căn bậc hai của số ngẫu nhiên):
    // cửa hàng mới mở kênh bán online nên đơn tăng dần theo thời gian.
    // Nhờ vậy 7 ngày cuối có đủ lượng bán để tính tốc độ bán cho lớp BI.
    const createdAt =
      WINDOW_START +
      (latestCreatedAt - WINDOW_START) * Math.sqrt(random());
    const createdMs = Math.floor(createdAt / 60000) * 60000;
    const channel = pickWeighted(random, CHANNELS);
    const customer = CUSTOMERS[Math.floor(random() * CUSTOMERS.length)];
    let phoneNumber = 10 + Math.floor(random() * 90);
    if (phoneNumber === 67 || phoneNumber === 68 || phoneNumber === 69) {
      phoneNumber = 70;
    }
    const phone = `09012345${String(phoneNumber).padStart(2, '0')}`;
    const address = lowTrustIndexes.has(index)
      ? { ...LOW_TRUST_ADDRESS }
      : (() => {
          const place =
            ADDRESSES[Math.floor(random() * ADDRESSES.length)];
          return {
            province: place.province,
            district: place.district,
            ward: place.ward,
            street: `Số ${1 + Math.floor(random() * 120)} ${place.streets[Math.floor(random() * place.streets.length)]}`,
          };
        })();
    const lineCount = random() < 0.7 ? 1 : 2;
    const items = [];
    const usedSkus = new Set();
    for (let line = 0; line < lineCount; line += 1) {
      const inLast7 = createdMs >= last7Start;
      const weighted = CATALOG.filter((item) => item.weight > 0).map(
        (item) => ({
          ...item,
          weight:
            item.weight *
            (inLast7 && item.sku === spikeSku ? 3 : 1),
        }),
      );
      let picked = pickWeighted(random, weighted);
      if (usedSkus.has(picked.sku)) {
        picked = weighted.find((item) => !usedSkus.has(item.sku)) ?? picked;
      }
      usedSkus.add(picked.sku);
      const roll = random();
      const quantity = roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3;
      items.push({ sku: picked.sku, quantity });
    }
    const deadlineDays = 2 + Math.floor(random() * 2);
    const deadline = toIso(
      dayStart(createdMs) + deadlineDays * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000,
    );
    const order = {
      idempotencyKey: `hist-order-${index + 1}`,
      customer,
      phone,
      items,
      channelId: channel.id,
      address,
      deadline,
      createdAt: toIso(createdMs),
      targetState,
    };
    if (failedIndexes.has(index)) {
      order.failOnce = true;
    }
    if (targetState === 'Hủy') {
      order.cancelReason =
        CANCEL_REASONS[Math.floor(random() * CANCEL_REASONS.length)];
    }
    if (targetState === 'Hoàn') {
      order.closeHandling =
        CLOSE_HANDLINGS[Math.floor(random() * CLOSE_HANDLINGS.length)];
    }
    return order;
  });

  // Phủ sóng SKU: mọi SKU trừ NM-40 phải xuất hiện ít nhất 2 lần.
  const lineCounts = new Map();
  for (const order of orders) {
    for (const line of order.items) {
      lineCounts.set(line.sku, (lineCounts.get(line.sku) ?? 0) + 1);
    }
  }
  const singleLineOrders = shuffle(
    random,
    orders.filter((order) => order.items.length === 1),
  );
  let singleCursor = 0;
  for (const item of CATALOG) {
    if (item.sku === 'NM-40') {
      continue;
    }
    while ((lineCounts.get(item.sku) ?? 0) < 2) {
      const target = singleLineOrders[singleCursor % singleLineOrders.length];
      singleCursor += 1;
      target.items.push({ sku: item.sku, quantity: 1 });
      lineCounts.set(item.sku, (lineCounts.get(item.sku) ?? 0) + 1);
    }
  }

  // Gán trả hàng: 13 đơn đã giao, lệch về kênh Chat để vượt ngưỡng bất
  // thường (tỷ lệ hoàn kênh vượt tỷ lệ chung hơn 10 điểm phần trăm).
  const delivered = orders.filter((order) =>
    DELIVERED_STATES.has(order.targetState),
  );
  const byChannel = new Map();
  for (const order of delivered) {
    const list = byChannel.get(order.channelId) ?? [];
    list.push(order);
    byChannel.set(order.channelId, list);
  }
  const returnPlan = [
    { channelId: 'K-1001', count: 9 },
    { channelId: 'K-1002', count: 3 },
    { channelId: 'K-1003', count: 1 },
  ];
  const nonPendingOutcomes = shuffle(random, [
    ...Array(5).fill('refunded'),
    ...Array(3).fill('approved'),
    ...Array(2).fill('rejected'),
  ]);
  let nonPendingCursor = 0;
  let pendingRemaining = 3;
  for (const plan of returnPlan) {
    const candidates = shuffle(
      random,
      [...(byChannel.get(plan.channelId) ?? [])],
    );
    // Trả hàng chờ xử lý chỉ gắn cho đơn còn ở Đã giao; trả hàng đã
    // duyệt/từ chối/hoàn tiền gắn cho đơn đã đóng (Hoàn) để đóng đơn
    // bằng returnId hoặc hướng xử lý tự gõ.
    const awaiting = candidates.filter(
      (order) => order.targetState === 'Đã giao',
    );
    const closed = candidates.filter(
      (order) => order.targetState === 'Hoàn',
    );
    const pendingCount = Math.min(
      pendingRemaining,
      awaiting.length,
      plan.count,
    );
    pendingRemaining -= pendingCount;
    for (let i = 0; i < pendingCount; i += 1) {
      awaiting[i].return = {
        reason:
          RETURN_REASONS[Math.floor(random() * RETURN_REASONS.length)],
        outcome: 'pending',
      };
    }
    for (let i = 0; i < plan.count - pendingCount; i += 1) {
      const order = closed[i];
      if (!order) {
        break;
      }
      order.return = {
        reason:
          RETURN_REASONS[Math.floor(random() * RETURN_REASONS.length)],
        outcome:
          nonPendingOutcomes[nonPendingCursor % nonPendingOutcomes.length],
      };
      nonPendingCursor += 1;
    }
  }

  // Bước điều chỉnh xác định: bảo đảm 3 tiền điều kiện của lớp BI
  // (mục 3 bản dự thảo) dù số ngẫu nhiên có lệch. Chỉ THÊM dòng hàng
  // (số lượng 2) vào đơn đã giao có đúng 1 dòng, không đổi SKU của dòng
  // có sẵn nên không phá phủ sóng SKU và không chạm đơn có trả hàng.
  const soldUnits = (sku, fromMs, toMs) => {
    let total = 0;
    for (const order of orders) {
      if (!DELIVERED_STATES.has(order.targetState)) {
        continue;
      }
      const createdMs = Date.parse(order.createdAt);
      if (createdMs < fromMs || createdMs >= toMs) {
        continue;
      }
      for (const line of order.items) {
        if (line.sku === sku) {
          total += line.quantity;
        }
      }
    }
    return total;
  };
  const addLineToDeliveredOrder = (sku, fromMs, toMs) => {
    const candidates = shuffle(
      random,
      orders.filter((order) => {
        if (!DELIVERED_STATES.has(order.targetState)) {
          return false;
        }
        if (order.items.length !== 1 || order.return) {
          return false;
        }
        if (order.items[0].sku === sku) {
          return false;
        }
        const createdMs = Date.parse(order.createdAt);
        return createdMs >= fromMs && createdMs < toMs;
      }),
    );
    const target = candidates[0];
    if (!target) {
      return false;
    }
    target.items.push({ sku, quantity: 2 });
    return true;
  };
  // Cầu tăng đột biến của NM-35: mốc 7 ngày trước ít nhất 6 đơn vị,
  // 7 ngày cuối hơn 2,2 lần mốc (ngưỡng kiểm tra chặt hơn ngưỡng 2 lần
  // của bản dự thảo để số liệu không nằm sát biên).
  for (
    let tries = 0;
    tries < 6 && soldUnits(spikeSku, prev7Start, last7Start) < 6;
    tries += 1
  ) {
    if (!addLineToDeliveredOrder(spikeSku, prev7Start, last7Start)) {
      break;
    }
  }
  for (
    let tries = 0;
    tries < 8 &&
    soldUnits(spikeSku, last7Start, SEED_RUN_CAP) <=
      2.2 * soldUnits(spikeSku, prev7Start, last7Start);
    tries += 1
  ) {
    if (!addLineToDeliveredOrder(spikeSku, last7Start, SEED_RUN_CAP)) {
      break;
    }
  }
  // Tồn kho sắp hết: mỗi SKU ứng viên cần bán được ít nhất 1 đơn vị
  // trong 7 ngày cuối thì mới tính được số ngày tồn kho còn lại.
  for (const item of CATALOG) {
    if (!item.lowStock) {
      continue;
    }
    if (soldUnits(item.sku, last7Start, SEED_RUN_CAP) > 0) {
      continue;
    }
    addLineToDeliveredOrder(item.sku, last7Start, SEED_RUN_CAP);
  }

  // Tính lượng đã giữ theo SKU (đơn qua đóng gói trở đi) và tốc độ bán
  // 7 ngày cuối (chỉ đơn đã giao) để đặt tồn kho đầu kỳ.
  const reserved = new Map();
  for (const order of orders) {
    if (!RESERVED_STATES.has(order.targetState)) {
      continue;
    }
    for (const line of order.items) {
      reserved.set(
        line.sku,
        (reserved.get(line.sku) ?? 0) + line.quantity,
      );
    }
  }
  const soldLast7 = new Map();
  const soldPrev7 = new Map();
  for (const order of orders) {
    if (!DELIVERED_STATES.has(order.targetState)) {
      continue;
    }
    const createdMs = Date.parse(order.createdAt);
    for (const line of order.items) {
      if (createdMs >= last7Start) {
        soldLast7.set(
          line.sku,
          (soldLast7.get(line.sku) ?? 0) + line.quantity,
        );
      } else if (createdMs >= prev7Start) {
        soldPrev7.set(
          line.sku,
          (soldPrev7.get(line.sku) ?? 0) + line.quantity,
        );
      }
    }
  }

  // 7 SKU tồn kho sắp hết: 7 SKU ứng viên có tốc độ bán 7 ngày cuối cao
  // nhất, tồn kho cuối kỳ chỉ còn 2-5 ngày bán (tối thiểu 1 đơn vị).
  const lowStockCover = [2, 3, 4, 5, 3, 4, 2];
  const lowStockSet = new Map();
  CATALOG.filter((item) => item.lowStock)
    .map((item) => ({
      sku: item.sku,
      velocity: (soldLast7.get(item.sku) ?? 0) / 7,
    }))
    .filter((entry) => entry.velocity > 0)
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 7)
    .forEach((entry, index) => {
      lowStockSet.set(entry.sku, lowStockCover[index]);
    });
  const inventory = CATALOG.map((item) => {
    const held = (reserved.get(item.sku) ?? 0) + (DEMO_RESERVED[item.sku] ?? 0);
    let finalStock;
    if (item.finalStock !== undefined) {
      finalStock = item.finalStock;
    } else if (lowStockSet.has(item.sku)) {
      const velocity = (soldLast7.get(item.sku) ?? 0) / 7;
      finalStock = Math.max(
        1,
        Math.round(velocity * lowStockSet.get(item.sku)),
      );
    } else {
      const velocity = (soldLast7.get(item.sku) ?? 0) / 7;
      if (velocity <= 0) {
        finalStock = 25 + Math.floor(random() * 36);
      } else {
        const cover = 15 + Math.floor(random() * 26);
        finalStock = Math.min(600, Math.max(3, Math.round(velocity * cover)));
      }
    }
    return {
      name: item.name,
      sku: item.sku,
      stock: finalStock + held,
      unit: item.unit,
      unitPrice: item.unitPrice,
    };
  });

  return { orders, inventory, reserved, soldLast7, soldPrev7 };
}

function validate(data) {
  const errors = [];
  const { orders, inventory, reserved, soldLast7, soldPrev7 } = data;
  if (orders.length !== HISTORICAL_COUNT) {
    errors.push(`cần ${HISTORICAL_COUNT} đơn lịch sử, có ${orders.length}`);
  }
  if (inventory.length !== 40) {
    errors.push(`cần 40 SKU, có ${inventory.length}`);
  }
  const distribution = {};
  for (const order of orders) {
    distribution[order.targetState] =
      (distribution[order.targetState] ?? 0) + 1;
  }
  for (const [state, count] of Object.entries(STATE_QUOTAS)) {
    if (distribution[state] !== count) {
      errors.push(
        `phân bố ${state}: cần ${count}, có ${distribution[state] ?? 0}`,
      );
    }
  }
  const keys = new Set();
  const lineCounts = new Map();
  for (const order of orders) {
    if (keys.has(order.idempotencyKey)) {
      errors.push(`trùng idempotencyKey ${order.idempotencyKey}`);
    }
    keys.add(order.idempotencyKey);
    if (Date.parse(order.createdAt) > SEED_RUN_CAP) {
      errors.push(`đơn ${order.idempotencyKey} có createdAt vượt mốc chạy`);
    }
    if (
      Date.parse(order.createdAt) +
        MAX_OFFSET_HOURS[order.targetState] * 60 * 60 * 1000 >
      SEED_RUN_CAP
    ) {
      errors.push(
        `đơn ${order.idempotencyKey} không kịp hoàn thành luồng trước mốc chạy`,
      );
    }
    for (const line of order.items) {
      lineCounts.set(line.sku, (lineCounts.get(line.sku) ?? 0) + 1);
      if (line.sku === 'NM-40') {
        errors.push(`đơn ${order.idempotencyKey} chứa SKU NM-40`);
      }
    }
  }
  for (const item of inventory) {
    if (item.sku === 'NM-40') {
      continue;
    }
    if ((lineCounts.get(item.sku) ?? 0) < 2) {
      errors.push(
        `SKU ${item.sku} chỉ xuất hiện ${lineCounts.get(item.sku) ?? 0} lần, cần ít nhất 2`,
      );
    }
  }
  const returns = orders.filter((order) => order.return);
  if (returns.length !== 13) {
    errors.push(`cần 13 đơn hoàn, có ${returns.length}`);
  }
  const delivered = orders.filter((order) =>
    DELIVERED_STATES.has(order.targetState),
  );
  const overallRate = returns.length / delivered.length;
  const chatDelivered = delivered.filter(
    (order) => order.channelId === 'K-1001',
  ).length;
  const chatReturns = returns.filter(
    (order) => order.channelId === 'K-1001',
  ).length;
  const chatRate = chatDelivered > 0 ? chatReturns / chatDelivered : 0;
  if (chatReturns < 3 || chatRate - overallRate <= 0.1) {
    errors.push(
      `tỷ lệ hoàn kênh Chat chưa vượt ngưỡng: Chat ${(chatRate * 100).toFixed(1)}% (${chatReturns}/${chatDelivered}), chung ${(overallRate * 100).toFixed(1)}%`,
    );
  }
  const spikeLast = soldLast7.get('NM-35') ?? 0;
  const spikePrev = soldPrev7.get('NM-35') ?? 0;
  if (spikePrev < 5 || spikeLast <= 2 * spikePrev) {
    errors.push(
      `cầu NM-35 chưa tăng đột biến: 7 ngày trước ${spikePrev}, 7 ngày cuối ${spikeLast}`,
    );
  }
  const lowStock = [];
  for (const item of inventory) {
    const velocity = (soldLast7.get(item.sku) ?? 0) / 7;
    const held = (reserved.get(item.sku) ?? 0) + (DEMO_RESERVED[item.sku] ?? 0);
    const finalStock = item.stock - held;
    if (velocity > 0 && finalStock / velocity < 7) {
      lowStock.push(item.sku);
    }
  }
  if (lowStock.length < 7) {
    errors.push(
      `cần ít nhất 7 SKU tồn kho dưới 7 ngày, có ${lowStock.length}: ${lowStock.join(', ')}`,
    );
  }
  const nm25 = inventory.find((item) => item.sku === 'NM-25');
  const nm25Final =
    nm25.stock - ((reserved.get('NM-25') ?? 0) + (DEMO_RESERVED['NM-25'] ?? 0));
  if (nm25Final !== 486) {
    errors.push(`tồn kho khả dụng NM-25 sau seed cần 486, có ${nm25Final}`);
  }
  const hsKho = inventory.find((item) => item.sku === 'HS-KHO');
  const hsKhoFinal =
    hsKho.stock - ((reserved.get('HS-KHO') ?? 0) + (DEMO_RESERVED['HS-KHO'] ?? 0));
  if (hsKhoFinal !== 304) {
    errors.push(`tồn kho khả dụng HS-KHO sau seed cần 304, có ${hsKhoFinal}`);
  }
  const nm40 = inventory.find((item) => item.sku === 'NM-40');
  if (nm40.stock !== 452) {
    errors.push(`tồn kho NM-40 cần 452, có ${nm40.stock}`);
  }
  return { errors, distribution, returns: returns.length, chatRate, overallRate, spikeLast, spikePrev, lowStock };
}

function report(data, check) {
  const { orders, inventory } = data;
  const lines = [];
  lines.push(`SKU: ${inventory.length} (mới ${inventory.length - 11})`);
  lines.push(`Đơn lịch sử: ${orders.length} (tổng 120 cùng 8 đơn demo)`);
  lines.push(
    `Phân bố trạng thái: ${Object.entries(check.distribution)
      .map(([state, count]) => `${state} ${count}`)
      .join(', ')}`,
  );
  lines.push(`Đơn hoàn: ${check.returns} (Chat ${orders.filter((o) => o.return && o.channelId === 'K-1001').length}, Web ${orders.filter((o) => o.return && o.channelId === 'K-1002').length}, Điện thoại ${orders.filter((o) => o.return && o.channelId === 'K-1003').length})`);
  lines.push(
    `Tỷ lệ hoàn: chung ${(check.overallRate * 100).toFixed(1)}%, Chat ${(check.chatRate * 100).toFixed(1)}%`,
  );
  lines.push(
    `Cầu NM-35: 7 ngày trước ${check.spikePrev}, 7 ngày cuối ${check.spikeLast}`,
  );
  lines.push(`SKU tồn kho dưới 7 ngày: ${check.lowStock.join(', ')}`);
  const createdAts = orders.map((o) => o.createdAt).sort();
  lines.push(
    `Khoảng ngày tạo đơn: ${createdAts[0].slice(0, 10)} tới ${createdAts[createdAts.length - 1].slice(0, 10)}`,
  );
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : null;
  if (outIndex >= 0 && !outDir) {
    console.error('Thiếu thư mục sau --out.');
    process.exit(1);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const apiSrc = join(root, 'services', 'api', 'src');
  const data = generate();
  const check = validate(data);
  if (check.errors.length > 0) {
    console.error('Dữ liệu mẫu KHÔNG đạt kiểm tra:');
    for (const error of check.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  const inventoryFile = {
    items: data.inventory,
    note: 'Tồn kho đầu kỳ theo SKU (trước khi nạp đơn mẫu). Tồn kho khả dụng sau khi nạp seed = stock - tổng lượng đã giữ cho đơn mẫu (112 đơn lịch sử + 8 đơn demo, xem services/api/src/seed/data/README.md). 11 SKU gốc giữ nguyên tồn kho khả dụng sau seed như dữ liệu đóng băng 02/11/2026 (NM-25 486, NM-40 452, HS-KHO 304, NM-15 398, MT-08 87, CK-03 324, NM-30 251, NM-45 91, MT-12 93, HS-MUC 89, CK-07 106). 29 SKU mới đều có giá tham khảo thị trường để lớp BI tính được doanh thu.',
  };
  const historicalFile = {
    items: data.orders,
    note: '112 đơn lịch sử nạp lúc API khởi động sau 8 đơn demo, qua đường dịch vụ thật (create rồi transition hợp lệ, kèm shipment và trả hàng khi cần) với thời gian lùi xác định trong 28 ngày 26/10-22/11/2026. Mã đơn LS-1001 trở đi (LS = lịch sử). Xem services/api/src/seed/data/README.md.',
  };
  const inventoryPath = outDir
    ? join(outDir, 'inventory.seed.json')
    : join(apiSrc, 'inventory', 'data', 'inventory.seed.json');
  const historicalPath = outDir
    ? join(outDir, 'historical-orders.seed.json')
    : join(apiSrc, 'seed', 'data', 'historical-orders.seed.json');
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
  } else {
    mkdirSync(join(apiSrc, 'seed', 'data'), { recursive: true });
  }
  writeFileSync(inventoryPath, JSON.stringify(inventoryFile));
  writeFileSync(historicalPath, JSON.stringify(historicalFile));
  console.log(report(data, check));
  console.log(`Đã ghi ${inventoryPath}`);
  console.log(`Đã ghi ${historicalPath}`);
}

main();
