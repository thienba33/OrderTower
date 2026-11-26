// SPDX-License-Identifier: Apache-2.0
// Du lieu mau dong bang ngay 02/11/2026 cho man BI va DX-Score.
// Bang du bao: 5 dong dau giu nguyen tung gia tri, 23 dong sau suy ra
// de du 28 ban ghi, trung voi the KPI "SKU du lich su 28/40".
// Panel mini du bao giu nguyen tung gia tri; 2 cho lech voi bang du bao:
// NM-40 kenh Web (mini: 18 don, tuan truoc 16, +13%; bang: 16 don,
// tuan truoc 14, +14%) va HS-KHO kenh Chat (mini: tuan truoc 14, +7%;
// bang: tuan truoc 12, +25%).

export type BiTab = "Tổng quan" | "Thực tế" | "Dự báo" | "Kênh bán" | "Tồn kho" | "Cảnh báo" | "Hoạt động";

export const BI_TABS: BiTab[] = ["Tổng quan", "Thực tế", "Dự báo", "Kênh bán", "Tồn kho", "Cảnh báo", "Hoạt động"];

export type ForecastChannel = "Chat" | "Web" | "Điện thoại";

export type ForecastRow = {
  sku: string;
  name: string;
  channel: ForecastChannel;
  lastWeek: number;
  forecast: number;
  explanation: string;
};

export const FORECAST_PRODUCT_NAMES: Record<string, string> = {
  "NM-25": "Nước mắm 25 độ 500ml",
  "NM-40": "Nước mắm 40 độ 500ml",
  "NM-15": "Nước mắm 15 độ 500ml",
  "NM-30": "Nước mắm 30 độ 500ml",
  "NM-45": "Nước mắm 45 độ 500ml",
  "HS-KHO": "Hải sản khô 500g",
  "HS-MUC": "Mực khô 200g",
  "MT-08": "Mắm tôm 250g",
  "MT-12": "Mắm tôm 500g",
  "CK-03": "Cá khô 300g",
  "CK-07": "Cá khô 500g",
};

export function forecastChangePercent(row: ForecastRow): number {
  if (row.lastWeek === 0) return 0;
  return Math.round(((row.forecast - row.lastWeek) / row.lastWeek) * 100);
}

export function formatForecastChange(row: ForecastRow): string {
  const change = forecastChangePercent(row);
  if (change === 0) return "0%";
  return change > 0 ? `+${change}%` : `${change}%`;
}

const EXPLICIT_FORECAST_ROWS: ForecastRow[] = [
  { sku: "NM-25", name: "Nước mắm 25 độ 500ml", channel: "Chat", lastWeek: 20, forecast: 28, explanation: "Cầu tăng 3 ngày liên tiếp, tồn L-118 còn 36 chai" },
  { sku: "NM-25", name: "Nước mắm 25 độ 500ml", channel: "Web", lastWeek: 16, forecast: 18, explanation: "Mức nền ổn định, không bất thường" },
  { sku: "NM-40", name: "Nước mắm 40 độ 500ml", channel: "Web", lastWeek: 14, forecast: 16, explanation: "Tốc độ bán 6/ngày, tồn 84 chai" },
  { sku: "HS-KHO", name: "Hải sản khô 500g", channel: "Chat", lastWeek: 12, forecast: 15, explanation: "Đơn hoàn kênh Chat cao, theo dõi thêm" },
  { sku: "NM-15", name: "Nước mắm 15 độ 500ml", channel: "Điện thoại", lastWeek: 9, forecast: 9, explanation: "Mức nền ổn định" },
];

// [sku, kenh, tuan truoc, du bao, giai thich]
const DERIVED_FORECAST_SPECS: [string, ForecastChannel, number, number, string][] = [
  ["NM-30", "Chat", 11, 12, "Mức nền ổn định"],
  ["NM-30", "Web", 8, 9, "Mức nền ổn định, không bất thường"],
  ["NM-45", "Chat", 6, 7, "Mức nền ổn định"],
  ["NM-45", "Web", 5, 5, "Mức nền ổn định"],
  ["NM-40", "Chat", 10, 12, "Tốc độ bán ổn định, tồn đủ dùng"],
  ["NM-40", "Điện thoại", 7, 8, "Mức nền ổn định"],
  ["NM-25", "Điện thoại", 13, 14, "Mức nền ổn định, không bất thường"],
  ["NM-15", "Chat", 10, 11, "Mức nền ổn định"],
  ["NM-15", "Web", 6, 6, "Mức nền ổn định"],
  ["HS-KHO", "Web", 9, 10, "Mức nền ổn định, không bất thường"],
  ["HS-KHO", "Điện thoại", 5, 6, "Mức nền ổn định"],
  ["HS-MUC", "Chat", 8, 9, "Mức nền ổn định"],
  ["HS-MUC", "Web", 6, 7, "Mức nền ổn định, không bất thường"],
  ["HS-MUC", "Điện thoại", 4, 4, "Mức nền ổn định"],
  ["MT-08", "Chat", 7, 8, "Tốc độ bán ổn định, tồn đủ dùng"],
  ["MT-08", "Web", 5, 5, "Mức nền ổn định"],
  ["MT-12", "Chat", 6, 7, "Mức nền ổn định"],
  ["MT-12", "Điện thoại", 4, 5, "Mức nền ổn định, không bất thường"],
  ["CK-03", "Chat", 9, 10, "Mức nền ổn định"],
  ["CK-03", "Web", 7, 8, "Mức nền ổn định, không bất thường"],
  ["CK-07", "Chat", 5, 6, "Mức nền ổn định"],
  ["CK-07", "Web", 4, 4, "Mức nền ổn định"],
  ["NM-30", "Điện thoại", 9, 10, "Tốc độ bán ổn định, tồn đủ dùng"],
];

export const FORECAST_ROWS: ForecastRow[] = [
  ...EXPLICIT_FORECAST_ROWS,
  ...DERIVED_FORECAST_SPECS.map(([sku, channel, lastWeek, forecast, explanation]) => ({
    sku,
    name: FORECAST_PRODUCT_NAMES[sku],
    channel,
    lastWeek,
    forecast,
    explanation,
  })),
];

export type ForecastMiniRow = {
  sku: string;
  channel: ForecastChannel;
  forecast: number;
  lastWeek: number;
  changePercent: number;
  barPercent: number;
};

export const FORECAST_MINI_ROWS: ForecastMiniRow[] = [
  { sku: "NM-25", channel: "Chat", forecast: 28, lastWeek: 20, changePercent: 40, barPercent: 80 },
  { sku: "NM-40", channel: "Web", forecast: 18, lastWeek: 16, changePercent: 13, barPercent: 26 },
  { sku: "HS-KHO", channel: "Chat", forecast: 15, lastWeek: 14, changePercent: 7, barPercent: 14 },
];

export type Anomaly = {
  id: string;
  title: string;
  evidence: string;
  proposal: string;
  approver: string;
};

export const ANOMALIES: Anomaly[] = [
  {
    id: "BC-01",
    title: "Tồn kho sắp hết",
    evidence: "L-118 còn 36/240, bán 9/ngày, hết trong 4 ngày, HSD 20/11",
    proposal: "Nhập thêm 120 chai, ưu tiên lô hạn dài",
    approver: "Thu (Quản lý)",
  },
  {
    id: "BC-02",
    title: "Tỷ lệ hoàn cao",
    evidence: "Kênh Chat 9/50 (18%) so với 8% toàn hệ thống",
    proposal: "Rà soát 9 đơn hoàn, gọi xác nhận trước khi giao",
    approver: "Thu (Quản lý)",
  },
  {
    id: "BC-03",
    title: "Cầu tăng đột biến",
    evidence: "NM-25 kênh Chat 28 so với mức nền 20 (+40%)",
    proposal: "Chuẩn bị thêm 40 chai cho đợt 14:00",
    approver: "Thu (Quản lý)",
  },
];

export type BiTodo = {
  rank: number;
  text: string;
  button: string;
  href: string;
};

export const BI_TODOS: BiTodo[] = [
  { rank: 1, text: "Chuẩn bị nhập lô L-118", button: "Xem tồn kho", href: "/warehouse" },
  { rank: 2, text: "Xem đơn hoàn kênh Chat", button: "Xem đơn hoàn", href: "/customer-care" },
  { rank: 3, text: "Duyệt đề xuất đổi xe DH-1051", button: "Xem đề xuất", href: "/approval-queue" },
];

export type DxAxis = {
  key: "P" | "D" | "I" | "H";
  value: number;
  max: number;
};

export const DX_AXES: DxAxis[] = [
  { key: "P", value: 18, max: 30 },
  { key: "D", value: 21, max: 30 },
  { key: "I", value: 12, max: 30 },
  { key: "H", value: 49, max: 100 },
];

export const DX_TOTAL = 51;
export const DX_TOTAL_MAX = 90;

// So phan hoi da ghi la so dong bang, khong dem live tu bang.
export const BI_FEEDBACK_LOGGED = 12;
export const BI_TOTAL_SKU = 40;

export type DxPeriod = {
  label: string;
  p: number;
  d: number;
  i: number;
  total: number;
  h: number;
  source: string;
};

export const DX_BEFORE: DxPeriod = {
  label: "Trước khi dùng hệ thống",
  p: 6,
  d: 7,
  i: 5,
  total: 18,
  h: 82,
  source: "Log mẫu 02/11/2026, công thức v1",
};

export const DX_AFTER: DxPeriod = {
  label: "Sau khi dùng hệ thống",
  p: 18,
  d: 21,
  i: 12,
  total: 51,
  h: 49,
  source: "Log thật 02/11/2026, công thức đóng băng mốc 2",
};

export type DxLog = {
  id: string;
  metric: string;
  value: string;
  source: string;
  time: string;
};

export const DX_LOGS: DxLog[] = [
  { id: "LOG-8812", metric: "P - Luồng trọn vẹn", value: "18/30", source: "WorkflowInstance, 101/120 đơn trọn luồng", time: "02/11 09:40" },
  { id: "LOG-8813", metric: "D - Phả hệ đầy đủ", value: "21/30", source: "Snapshot đóng băng 02/11, phả hệ tới đơn gốc", time: "02/11 09:40" },
  { id: "LOG-8814", metric: "I - Đề xuất đúng", value: "12/30", source: "AIRecommendation + AIFeedback, 12 phản hồi", time: "02/11 09:40" },
  { id: "LOG-8815", metric: "H - Bước làm tay", value: "49/100", source: "AuditLog, thời gian chờ duyệt trung bình", time: "02/11 09:40" },
];
