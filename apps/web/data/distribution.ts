// SPDX-License-Identifier: Apache-2.0
// Du lieu mau dong bang ngay 02/11/2026 cho man Phan phoi don (3 che do xem:
// Xem tat ca, Can chu y, Nhan vien; dialog De xuat phan cong - Dot 14:00).
// 5 dong phan phoi, 4 dong audit va 5 nhan vien dau giu nguyen tung gia tri
// trong khung (32:2710, 32:3170, 32:3378, 49:113). Phan con lai suy ra:
// 17 dong phan phoi lay ma don va SKU tu danh sach don (12 da chia, 5 chua
// chia), vi tri kho noi theo khu (A1-10x, A2-20x, A3-30x, B1-0x), nhan vien
// va block theo bang nhan vien (Hoang Nam/Phuong Linh B-18, Duc Anh/Thu
// Thao B-17, Minh Quan B-16); 3 dong audit la cac dot sang som 06:00, 04:00,
// 02:00; 3 nhan vien K06-K08, ETA tinh bang lam tron(con lai/toc do x 60).
// Luu y: khung ghi DH-1041 NM-25, DH-1038 NM-40, DH-1029 NM-15, trong khi
// danh sach don ghi NM-40, NM-25, NM-40; man nay lay theo khung, giong cach
// Telesale va Phan tach dia chi lay theo khung. The "x2"/"x1" tren the ngoai
// le giu nguyen trong khung, khong khop so luong trong danh sach don
// (DH-1042 x1, DH-1091 x3). Cac so khung dong bang duoc giu nguyen ca khi
// khong khop phep tinh: tien do the cong nhan (65%/92%/61% thay vi
// 67%/70%/62,5%), ETA Phuong Linh 55 phut thay vi 64 phut tinh tu 17 don
// con lai voi toc do 16 don/gio. Khung mau thuan: the ngoai le ghi "Nhan
// vien K03 nghi dot xuat" nhung Duc Anh (K03) van hien la dang dong goi
// voi tien do 92%; man nay giu ca hai nhu khung, va khi phan cong lai thi
// loai K03 ra khoi danh sach ung vien.

export type DistributionStatus = "Đang đóng gói" | "Hoàn thành" | "Chưa chia";

export type DistributionRow = {
  id: string;
  sku: string;
  position: string;
  worker: string;
  status: DistributionStatus;
  block: string;
};

export const DISTRIBUTION_ROWS: DistributionRow[] = [
  { id: "DH-1041", sku: "NM-25", position: "A1-101", worker: "Hoàng Nam", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1038", sku: "NM-40", position: "A1-102", worker: "Hoàng Nam", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1033", sku: "HS-KHO", position: "A2-201", worker: "Phương Linh", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1029", sku: "NM-15", position: "A1-103", worker: "Đức Anh", status: "Hoàn thành", block: "B-17" },
  { id: "DH-1024", sku: "NM-25", position: "A3-301", worker: "Thu Thảo", status: "Hoàn thành", block: "B-17" },
  { id: "DH-1005", sku: "NM-25", position: "A1-104", worker: "Hoàng Nam", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1006", sku: "NM-40", position: "A1-105", worker: "Hoàng Nam", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1008", sku: "HS-KHO", position: "A2-202", worker: "Phương Linh", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1009", sku: "NM-25", position: "A2-203", worker: "Phương Linh", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1010", sku: "NM-40", position: "A1-106", worker: "Đức Anh", status: "Hoàn thành", block: "B-17" },
  { id: "DH-1011", sku: "NM-15", position: "A3-302", worker: "Thu Thảo", status: "Hoàn thành", block: "B-17" },
  { id: "DH-1012", sku: "HS-KHO", position: "A2-204", worker: "Phương Linh", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1013", sku: "NM-25", position: "A1-107", worker: "Đức Anh", status: "Đang đóng gói", block: "B-17" },
  { id: "DH-1014", sku: "NM-40", position: "A3-303", worker: "Thu Thảo", status: "Đang đóng gói", block: "B-17" },
  { id: "DH-1015", sku: "NM-15", position: "B1-01", worker: "Minh Quân", status: "Hoàn thành", block: "B-16" },
  { id: "DH-1016", sku: "HS-KHO", position: "B1-02", worker: "Minh Quân", status: "Hoàn thành", block: "B-16" },
  { id: "DH-1017", sku: "NM-25", position: "A1-108", worker: "Hoàng Nam", status: "Đang đóng gói", block: "B-18" },
  { id: "DH-1018", sku: "NM-40", position: "A1-109", worker: "", status: "Chưa chia", block: "" },
  { id: "DH-1020", sku: "HS-KHO", position: "A2-205", worker: "", status: "Chưa chia", block: "" },
  { id: "DH-1021", sku: "NM-25", position: "A3-304", worker: "", status: "Chưa chia", block: "" },
  { id: "DH-1022", sku: "NM-40", position: "A1-110", worker: "", status: "Chưa chia", block: "" },
  { id: "DH-1023", sku: "NM-15", position: "A2-206", worker: "", status: "Chưa chia", block: "" },
];

export type AuditRow = {
  batch: string;
  approvedAt: string;
  orderCount: number;
  staffCount: number;
  exceptionCount: number;
  approver: string;
  note: string;
};

export const DISTRIBUTION_AUDIT_ROWS: AuditRow[] = [
  { batch: "Đợt 14:00", approvedAt: "13:52", orderCount: 120, staffCount: 4, exceptionCount: 3, approver: "Thu", note: "Đã duyệt phương án, 3 đơn xử lý tay" },
  { batch: "Đợt 12:00", approvedAt: "11:48", orderCount: 98, staffCount: 4, exceptionCount: 1, approver: "Thu", note: "Đã duyệt, 1 đơn chờ kho xác nhận" },
  { batch: "Đợt 10:00", approvedAt: "09:55", orderCount: 105, staffCount: 4, exceptionCount: 2, approver: "Thu", note: "Đã duyệt, bổ sung 2 nhân viên" },
  { batch: "Đợt 08:00", approvedAt: "07:58", orderCount: 87, staffCount: 3, exceptionCount: 0, approver: "Thu", note: "Đã duyệt" },
  { batch: "Đợt 06:00", approvedAt: "05:52", orderCount: 76, staffCount: 3, exceptionCount: 1, approver: "Thu", note: "Đã duyệt, 1 đơn chờ kho xác nhận" },
  { batch: "Đợt 04:00", approvedAt: "03:48", orderCount: 64, staffCount: 3, exceptionCount: 0, approver: "Thu", note: "Đã duyệt" },
  { batch: "Đợt 02:00", approvedAt: "01:55", orderCount: 52, staffCount: 2, exceptionCount: 1, approver: "Thu", note: "Đã duyệt, bổ sung 1 nhân viên" },
];

export type DistributionStaffStatus = "Đang đóng gói" | "Hoàn thành";

export type DistributionStaff = {
  id: string;
  name: string;
  block: string;
  done: number;
  remaining: number;
  speedPerHour: number;
  etaMinutes: number;
  status: DistributionStaffStatus;
  zone: string;
};

export const DISTRIBUTION_STAFF: DistributionStaff[] = [
  { id: "K01", name: "Hoàng Nam", block: "B-18", done: 34, remaining: 12, speedPerHour: 18, etaMinutes: 40, status: "Đang đóng gói", zone: "A1" },
  { id: "K02", name: "Phương Linh", block: "B-18", done: 29, remaining: 17, speedPerHour: 16, etaMinutes: 55, status: "Đang đóng gói", zone: "A2" },
  { id: "K03", name: "Đức Anh", block: "B-17", done: 41, remaining: 5, speedPerHour: 20, etaMinutes: 15, status: "Đang đóng gói", zone: "A1" },
  { id: "K04", name: "Thu Thảo", block: "B-17", done: 38, remaining: 8, speedPerHour: 19, etaMinutes: 25, status: "Đang đóng gói", zone: "A3" },
  { id: "K05", name: "Minh Quân", block: "B-16", done: 46, remaining: 0, speedPerHour: 21, etaMinutes: 0, status: "Hoàn thành", zone: "B1" },
  { id: "K06", name: "Quốc Bảo", block: "B-16", done: 22, remaining: 9, speedPerHour: 15, etaMinutes: 36, status: "Đang đóng gói", zone: "A1" },
  { id: "K07", name: "Thanh Tú", block: "B-17", done: 18, remaining: 14, speedPerHour: 14, etaMinutes: 60, status: "Đang đóng gói", zone: "A2" },
  { id: "K08", name: "Văn An", block: "B-18", done: 12, remaining: 20, speedPerHour: 12, etaMinutes: 100, status: "Đang đóng gói", zone: "A3" },
];

export type DistributionException = {
  id: string;
  suffix: string;
  position: string;
  reason: string;
  absentCode: string | null;
};

export const DISTRIBUTION_EXCEPTIONS: DistributionException[] = [
  { id: "DH-1042", suffix: "x2", position: "A3-12", reason: "Nhân viên K03 nghỉ đột xuất", absentCode: "K03" },
  { id: "DH-1089", suffix: "x1", position: "B1-07", reason: "Nhân viên K03 nghỉ đột xuất", absentCode: "K03" },
  { id: "DH-1091", suffix: "x1", position: "A1-105", reason: "Lô L-118 sắp hết, cần xác nhận", absentCode: null },
];

// The khoi dong goi hien tai tren tab Can chu y: so phieu va so da xong
// lay theo khung, tien do giu nguyen gia tri khung (khong tinh lai tu
// da xong/tong phieu).
export type PackingProgress = {
  staffId: string;
  blockTickets: number;
  doneTickets: number;
  progressPercent: number;
};

export const PACKING_PROGRESS: PackingProgress[] = [
  { staffId: "K01", blockTickets: 18, doneTickets: 12, progressPercent: 65 },
  { staffId: "K03", blockTickets: 20, doneTickets: 14, progressPercent: 92 },
  { staffId: "K04", blockTickets: 16, doneTickets: 10, progressPercent: 61 },
];

export const PROPOSAL_OVERLOAD_STANDARD = 30;

export type ProposalRow = {
  staffId: string;
  block: string;
  orders: number;
};

export const PROPOSAL_ROWS: ProposalRow[] = [
  { staffId: "K01", block: "B-18", orders: 34 },
  { staffId: "K02", block: "B-18", orders: 29 },
  { staffId: "K03", block: "B-17", orders: 41 },
  { staffId: "K04", block: "B-17", orders: 16 },
];

export function staffName(staffId: string): string {
  return DISTRIBUTION_STAFF.find((staff) => staff.id === staffId)?.name ?? staffId;
}

export function staffLabel(staffId: string): string {
  const staff = DISTRIBUTION_STAFF.find((item) => item.id === staffId);
  return staff ? `${staff.name} (${staff.id})` : staffId;
}
