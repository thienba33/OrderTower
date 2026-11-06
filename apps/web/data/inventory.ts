// Dữ liệu mẫu đóng băng ngày 02/11/2026 cho màn Kho và tồn kho.
// Mỗi dòng là một lô hàng của một SKU. Trạng thái tồn được tính từ số ngày
// đủ dùng và hạn dùng, theo quy tắc đã kiểm chứng khớp cả 6 dòng mẫu:
// đủ dùng <= 5 ngày -> "Sắp hết"; hạn dùng trong 30 ngày -> "Sắp hết hạn";
// đủ dùng <= 10 ngày -> "Cần theo dõi"; còn lại -> "Đủ hàng".

export type InventoryStatus = "Sắp hết" | "Sắp hết hạn" | "Cần theo dõi" | "Đủ hàng";

export interface InventoryRow {
  sku: string;
  name: string;
  group: string;
  lot: string;
  expiry: string; // ISO yyyy-mm-dd, hiển thị dd/mm/yyyy
  stock: number;
  reserved: number;
  soldPerDay: number;
  unit: string;
  forecast: string;
  daysLeft: number;
  status: InventoryStatus;
}

export const INVENTORY_STATUSES: InventoryStatus[] = [
  "Sắp hết",
  "Sắp hết hạn",
  "Cần theo dõi",
  "Đủ hàng",
];

export const INVENTORY_STATUS_PILL: Record<InventoryStatus, string> = {
  "Sắp hết": "bg-red-50 text-red-700",
  "Sắp hết hạn": "bg-amber-50 text-amber-800",
  "Cần theo dõi": "bg-amber-50 text-amber-800",
  "Đủ hàng": "bg-green-50 text-green-700",
};

export function formatExpiry(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatExpiryShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const SAMPLE_DATE = new Date("2026-11-02T00:00:00Z");

function daysUntilExpiry(iso: string): number {
  const expiry = new Date(`${iso}T00:00:00Z`);
  return Math.round((expiry.getTime() - SAMPLE_DATE.getTime()) / 86400000);
}

function buildRow(
  sku: string,
  name: string,
  group: string,
  lot: string,
  expiry: string,
  stock: number,
  reserved: number,
  soldPerDay: number,
  unit: string,
  forecast: string,
): InventoryRow {
  const daysLeft = Math.floor(stock / soldPerDay);
  let status: InventoryStatus;
  if (daysLeft <= 5) status = "Sắp hết";
  else if (daysUntilExpiry(expiry) <= 30) status = "Sắp hết hạn";
  else if (daysLeft <= 10) status = "Cần theo dõi";
  else status = "Đủ hàng";
  return { sku, name, group, lot, expiry, stock, reserved, soldPerDay, unit, forecast, daysLeft, status };
}

// 6 dòng trên trang 1 của thiết kế, giữ nguyên từng giá trị.
const EXPLICIT_ROWS: InventoryRow[] = [
  buildRow("NM-25", "Nước mắm 25 độ 500ml", "Nước mắm", "L-118", "2026-11-20", 36, 22, 9, "chai", "28 đơn kênh Chat (+40%)"),
  buildRow("NM-40", "Nước mắm 40 độ 500ml", "Nước mắm", "L-121", "2027-03-02", 84, 18, 6, "chai", "18 đơn kênh Web (+15%)"),
  buildRow("HS-KHO", "Hải sản khô 500g", "Hải sản khô", "H-052", "2026-12-15", 58, 31, 7, "gói", "22 đơn kênh Chat (+10%)"),
  buildRow("NM-15", "Nước mắm 15 độ 500ml", "Nước mắm", "L-119", "2027-01-18", 120, 12, 4, "chai", "12 đơn kênh Chat (+5%)"),
  buildRow("MT-08", "Mắm tôm 250g", "Mắm tôm", "M-031", "2026-11-28", 22, 9, 3, "hũ", "9 đơn kênh Điện thoại (+8%)"),
  buildRow("CK-03", "Cá khô 300g", "Cá khô", "C-014", "2027-02-10", 96, 14, 5, "gói", "15 đơn kênh Web (+12%)"),
];

// 34 dòng còn lại để đủ 40 bản ghi, chia theo đúng số đếm trên thẻ KPI:
// Sắp hết thêm 2, Sắp hết hạn thêm 1, Cần theo dõi thêm 11, Đủ hàng thêm 20.
// Mỗi dòng: [sku, tên, nhóm, lô, hạn dùng, tồn, giữ, bán/ngày, đơn vị, dự báo].
const DERIVED_SPECS: [string, string, string, string, string, number, number, number, string, string][] = [
  ["NM-30", "Nước mắm 30 độ 500ml", "Nước mắm", "L-201", "2027-03-15", 12, 4, 4, "chai", "10 đơn kênh Chat (+12%)"],
  ["NM-45", "Nước mắm 45 độ 500ml", "Nước mắm", "L-202", "2027-02-20", 18, 6, 5, "chai", "8 đơn kênh Web (+6%)"],
  ["MT-12", "Mắm tôm 500g", "Mắm tôm", "M-040", "2026-11-25", 40, 10, 3, "hũ", "7 đơn kênh Điện thoại (+9%)"],
  ["NM-25", "Nước mắm 25 độ 500ml", "Nước mắm", "L-122", "2027-01-10", 54, 15, 7, "chai", "20 đơn kênh Chat (+18%)"],
  ["NM-40", "Nước mắm 40 độ 500ml", "Nước mắm", "L-123", "2027-02-15", 63, 20, 7, "chai", "14 đơn kênh Web (+11%)"],
  ["HS-KHO", "Hải sản khô 500g", "Hải sản khô", "H-053", "2027-01-20", 42, 12, 6, "gói", "16 đơn kênh Chat (+9%)"],
  ["NM-15", "Nước mắm 15 độ 500ml", "Nước mắm", "L-124", "2027-03-05", 36, 8, 5, "chai", "9 đơn kênh Chat (+4%)"],
  ["MT-08", "Mắm tôm 250g", "Mắm tôm", "M-032", "2027-01-25", 30, 6, 4, "hũ", "6 đơn kênh Điện thoại (+7%)"],
  ["CK-03", "Cá khô 300g", "Cá khô", "C-015", "2027-02-10", 45, 10, 5, "gói", "11 đơn kênh Web (+8%)"],
  ["NM-30", "Nước mắm 30 độ 500ml", "Nước mắm", "L-203", "2027-04-01", 48, 9, 6, "chai", "9 đơn kênh Chat (+10%)"],
  ["HS-MUC", "Mực khô 200g", "Hải sản khô", "H-060", "2027-02-28", 35, 7, 5, "gói", "8 đơn kênh Chat (+14%)"],
  ["NM-25", "Nước mắm 25 độ 500ml", "Nước mắm", "L-125", "2027-03-12", 60, 18, 8, "chai", "21 đơn kênh Chat (+16%)"],
  ["NM-40", "Nước mắm 40 độ 500ml", "Nước mắm", "L-126", "2027-01-30", 72, 14, 9, "chai", "17 đơn kênh Web (+13%)"],
  ["CK-07", "Cá khô 500g", "Cá khô", "C-020", "2027-03-20", 40, 8, 5, "gói", "10 đơn kênh Web (+7%)"],
  ["NM-25", "Nước mắm 25 độ 500ml", "Nước mắm", "L-127", "2027-04-15", 150, 25, 8, "chai", "24 đơn kênh Chat (+20%)"],
  ["NM-40", "Nước mắm 40 độ 500ml", "Nước mắm", "L-128", "2027-05-01", 110, 20, 6, "chai", "15 đơn kênh Web (+9%)"],
  ["HS-KHO", "Hải sản khô 500g", "Hải sản khô", "H-054", "2027-03-10", 90, 15, 6, "gói", "19 đơn kênh Chat (+11%)"],
  ["NM-15", "Nước mắm 15 độ 500ml", "Nước mắm", "L-129", "2027-04-20", 140, 18, 5, "chai", "13 đơn kênh Chat (+6%)"],
  ["MT-08", "Mắm tôm 250g", "Mắm tôm", "M-033", "2027-02-15", 60, 10, 3, "hũ", "8 đơn kênh Điện thoại (+5%)"],
  ["CK-03", "Cá khô 300g", "Cá khô", "C-016", "2027-05-10", 130, 22, 5, "gói", "14 đơn kênh Web (+10%)"],
  ["NM-30", "Nước mắm 30 độ 500ml", "Nước mắm", "L-204", "2027-06-01", 100, 12, 4, "chai", "11 đơn kênh Chat (+8%)"],
  ["NM-45", "Nước mắm 45 độ 500ml", "Nước mắm", "L-205", "2027-05-15", 95, 16, 5, "chai", "9 đơn kênh Web (+7%)"],
  ["HS-MUC", "Mực khô 200g", "Hải sản khô", "H-061", "2027-04-10", 70, 9, 4, "gói", "7 đơn kênh Chat (+12%)"],
  ["NM-25", "Nước mắm 25 độ 500ml", "Nước mắm", "L-130", "2027-06-15", 180, 30, 9, "chai", "26 đơn kênh Chat (+22%)"],
  ["NM-40", "Nước mắm 40 độ 500ml", "Nước mắm", "L-131", "2027-07-01", 120, 15, 6, "chai", "16 đơn kênh Web (+10%)"],
  ["HS-KHO", "Hải sản khô 500g", "Hải sản khô", "H-055", "2027-05-20", 110, 18, 7, "gói", "20 đơn kênh Chat (+13%)"],
  ["NM-15", "Nước mắm 15 độ 500ml", "Nước mắm", "L-132", "2027-06-10", 160, 20, 4, "chai", "14 đơn kênh Chat (+7%)"],
  ["MT-12", "Mắm tôm 500g", "Mắm tôm", "M-041", "2027-03-25", 75, 12, 3, "hũ", "8 đơn kênh Điện thoại (+6%)"],
  ["CK-07", "Cá khô 500g", "Cá khô", "C-021", "2027-06-20", 85, 11, 5, "gói", "12 đơn kênh Web (+9%)"],
  ["NM-30", "Nước mắm 30 độ 500ml", "Nước mắm", "L-206", "2027-07-15", 130, 14, 5, "chai", "12 đơn kênh Chat (+9%)"],
  ["NM-25", "Nước mắm 25 độ 500ml", "Nước mắm", "L-133", "2027-05-25", 140, 22, 8, "chai", "23 đơn kênh Chat (+19%)"],
  ["NM-40", "Nước mắm 40 độ 500ml", "Nước mắm", "L-134", "2027-08-01", 100, 10, 6, "chai", "15 đơn kênh Web (+11%)"],
  ["HS-KHO", "Hải sản khô 500g", "Hải sản khô", "H-056", "2027-06-05", 95, 13, 6, "gói", "18 đơn kênh Chat (+12%)"],
  ["CK-03", "Cá khô 300g", "Cá khô", "C-017", "2027-07-10", 115, 16, 5, "gói", "13 đơn kênh Web (+8%)"],
];

export const INVENTORY_ROWS: InventoryRow[] = [
  ...EXPLICIT_ROWS,
  ...DERIVED_SPECS.map((spec) => buildRow(...spec)),
];

export const INVENTORY_GROUPS: string[] = Array.from(
  new Set(INVENTORY_ROWS.map((row) => row.group)),
);

export const SUPPLIERS: string[] = [
  "Hộ sản xuất nước mắm - Lô mới, hạn dài",
  "Hộ sản xuất nước mắm - Lô thường",
  "Nhà cung cấp hải sản khô",
  "Hộ sản xuất thủ công",
];

export function defaultSupplier(group: string): string {
  if (group === "Hải sản khô") return "Nhà cung cấp hải sản khô";
  if (group === "Nước mắm") return "Hộ sản xuất nước mắm - Lô mới, hạn dài";
  return "Hộ sản xuất thủ công";
}

export interface IncomingRow {
  id: string;
  sku: string;
  product: string;
  quantity: string;
  expectedDate: string;
  status: string;
  note: string;
}

// 3 dòng trong bảng "Hàng đang về" của thiết kế. Thẻ KPI ghi 4 lô đang về
// nên thêm 1 dòng suy ra (NH-034) để số đếm khớp với bảng.
export const INCOMING_ROWS: IncomingRow[] = [
  { id: "NH-031", sku: "NM-25", product: "Nước mắm 25 độ", quantity: "120 chai", expectedDate: "05/11/2026", status: "Đã duyệt - chờ về", note: "Chờ quản lý duyệt đã xong, theo đề xuất L-118" },
  { id: "NH-032", sku: "HS-KHO", product: "Hải sản khô", quantity: "80 gói", expectedDate: "06/11/2026", status: "Đang vận chuyển", note: "Lô mới, hạn dùng từ 01/2027" },
  { id: "NH-033", sku: "NM-40", product: "Nước mắm 40 độ", quantity: "60 chai", expectedDate: "08/11/2026", status: "Chờ xác nhận", note: "Theo dự báo kênh Web tăng" },
  { id: "NH-034", sku: "NM-15", product: "Nước mắm 15 độ", quantity: "50 chai", expectedDate: "09/11/2026", status: "Chờ xác nhận", note: "Bổ sung theo tồn thấp" },
];
