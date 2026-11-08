// SPDX-License-Identifier: Apache-2.0
// Du lieu mau dong bang ngay 02/11/2026 cho man Telesale (4 che do xem:
// Tong quan, Phan chia don, Cong viec, Nhan vien).
// 7 don uu tien dau giu nguyen tung gia tri trong khung. 11 don sau suy ra
// tu danh sach don, ETA tinh tu moc 07:30, ly do va goi y xep theo quy tac
// (do tin cay thap -> xac nhan dia chi, gia tri cao -> xac nhan COD,
// moc giao tu 13:00 tro di -> khach hen gio nhan, con lai -> sap qua SLA).
// Luu y: khung ghi DH-1019 la KH-063, Web, moc 15:00, NM-40 x2, trong khi
// danh sach don ghi KH-028, Chat, moc 08:30, NM-15 x3; man nay lay theo
// khung. Khung ghi DH-1024 kenh Web, danh sach don ghi Chat; man nay lay
// theo khung.

import { ORDERS, type Order, type OrderChannel } from "./orders";

export type TelesaleStaffStatus = "Đang nhận" | "Tạm dừng" | "Nghỉ";

export const STAFF_STATUS_TEXT: Record<TelesaleStaffStatus, string> = {
  "Đang nhận": "text-green-700",
  "Tạm dừng": "text-amber-700",
  Nghỉ: "text-gray-500",
};

export type TelesaleStaff = {
  id: string;
  name: string;
  status: TelesaleStaffStatus;
  totalCalls: number;
  success: number;
  failed: number;
  avgCallTime: string;
  totalCallTime: string;
  progressPercent: number;
  assignedCalls?: number;
};

export const TELESALE_STAFF: TelesaleStaff[] = [
  { id: "NV01", name: "Minh Anh", status: "Đang nhận", totalCalls: 11, success: 8, failed: 3, avgCallTime: "4p12", totalCallTime: "45p32", progressPercent: 61, assignedCalls: 18 },
  { id: "NV02", name: "Thu Hằng", status: "Đang nhận", totalCalls: 8, success: 6, failed: 2, avgCallTime: "3p48", totalCallTime: "30p24", progressPercent: 52 },
  { id: "NV03", name: "Quốc Bảo", status: "Tạm dừng", totalCalls: 8, success: 4, failed: 4, avgCallTime: "5p02", totalCallTime: "40p16", progressPercent: 44 },
  { id: "NV04", name: "Thanh Tú", status: "Đang nhận", totalCalls: 10, success: 9, failed: 1, avgCallTime: "3p30", totalCallTime: "35p00", progressPercent: 68 },
  { id: "NV05", name: "NV dự phòng 1", status: "Nghỉ", totalCalls: 0, success: 0, failed: 0, avgCallTime: "—", totalCallTime: "—", progressPercent: 0 },
  { id: "NV06", name: "NV dự phòng 2", status: "Nghỉ", totalCalls: 0, success: 0, failed: 0, avgCallTime: "—", totalCallTime: "—", progressPercent: 0 },
  { id: "NV07", name: "NV dự phòng 3", status: "Nghỉ", totalCalls: 0, success: 0, failed: 0, avgCallTime: "—", totalCallTime: "—", progressPercent: 0 },
  { id: "NV08", name: "NV dự phòng 4", status: "Nghỉ", totalCalls: 0, success: 0, failed: 0, avgCallTime: "—", totalCallTime: "—", progressPercent: 0 },
];

export function staffSuccessRate(staff: TelesaleStaff): number {
  if (staff.totalCalls === 0) return 0;
  return Math.round((staff.success / staff.totalCalls) * 100);
}

// Ty le thanh cong toan doi, tinh tu tong so lieu cua 4 nhan vien dang lam.
export const TEAM_TOTAL_CALLS = 37;
export const TEAM_SUCCESS = 27;
export const TEAM_FAILED = 10;
export const TEAM_SUCCESS_RATE = Math.round((TEAM_SUCCESS / TEAM_TOTAL_CALLS) * 100);
// TG goi trung binh toan doi giu nguyen gia tri trong khung (4p12), khong
// bang trung binh co trong so cua 4 nhan vien (khoang 4p06).
export const TEAM_AVG_CALL_TIME = "4p12";

export type PriorityCallStatus = "Chờ gọi" | "Đang gọi";
export type PriorityAssignStatus = "Chưa chia" | "Đã chia" | "Đang gọi";

export const ASSIGN_STATUS_PILL: Record<PriorityAssignStatus, string> = {
  "Chưa chia": "bg-amber-50 text-amber-800",
  "Đã chia": "bg-gray-100 text-gray-700",
  "Đang gọi": "bg-green-50 text-green-700",
};

export type PriorityOrder = {
  id: string;
  channel: OrderChannel;
  customer: string;
  phone: string;
  deadline: string;
  product: string;
  eta: string;
  suggestion: string;
  reason?: string;
  callStatus: PriorityCallStatus;
  assignStatus: PriorityAssignStatus;
};

const EXPLICIT_PRIORITY_ORDERS: PriorityOrder[] = [
  { id: "DH-1051", channel: "Chat", customer: "KH-014", phone: "0912 *** 456", deadline: "02/11 10:00", product: "NM-25 x2", eta: "2h30", suggestion: "Gọi trước 10:00", reason: "Sắp quá SLA giao hẹn", callStatus: "Chờ gọi", assignStatus: "Chưa chia" },
  { id: "DH-1041", channel: "Web", customer: "KH-027", phone: "0903 *** 781", deadline: "02/11 11:00", product: "NM-40 x1", eta: "3h05", suggestion: "Xác nhận địa chỉ", reason: "Địa chỉ độ tin cậy thấp", callStatus: "Chờ gọi", assignStatus: "Chưa chia" },
  { id: "DH-1044", channel: "Điện thoại", customer: "KH-033", phone: "0987 *** 210", deadline: "02/11 10:30", product: "HS-KHO x3", eta: "2h10", suggestion: "Xác nhận COD", reason: "Đơn giá trị cao", callStatus: "Đang gọi", assignStatus: "Đang gọi" },
  { id: "DH-1038", channel: "Chat", customer: "KH-041", phone: "0934 *** 902", deadline: "02/11 12:00", product: "NM-25 x1", eta: "4h20", suggestion: "Xác nhận địa chỉ", reason: "Địa chỉ độ tin cậy thấp", callStatus: "Chờ gọi", assignStatus: "Chưa chia" },
  { id: "DH-1055", channel: "Web", customer: "KH-052", phone: "0909 *** 318", deadline: "02/11 14:00", product: "NM-15 x2", eta: "5h00", suggestion: "Nhắc nhận hàng", reason: "Khách hẹn giờ nhận", callStatus: "Chờ gọi", assignStatus: "Chưa chia" },
  { id: "DH-1033", channel: "Chat", customer: "KH-058", phone: "0918 *** 674", deadline: "02/11 11:30", product: "HS-KHO x1", eta: "3h40", suggestion: "Xác nhận COD", reason: "Sắp quá SLA giao hẹn", callStatus: "Chờ gọi", assignStatus: "Đã chia" },
  { id: "DH-1019", channel: "Web", customer: "KH-063", phone: "0905 *** 129", deadline: "02/11 15:00", product: "NM-40 x2", eta: "6h10", suggestion: "Nhắc nhận hàng", callStatus: "Chờ gọi", assignStatus: "Chưa chia" },
];

// 11 don suy ra, xep theo moc giao tang dan.
const DERIVED_PRIORITY_IDS = [
  "DH-1001",
  "DH-1002",
  "DH-1003",
  "DH-1020",
  "DH-1021",
  "DH-1010",
  "DH-1011",
  "DH-1030",
  "DH-1012",
  "DH-1031",
  "DH-1032",
];

function etaFromDeadline(deadline: string): string {
  const time = deadline.slice(6);
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes - (7 * 60 + 30);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function etaMinutes(eta: string): number {
  const match = eta.match(/^(\d+)h(\d+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

// ETA do (<= 2h30) hien do, giong 2 dong do trong khung (2h30, 2h10).
export function isUrgentEta(eta: string): boolean {
  return etaMinutes(eta) <= 150;
}

function buildDerivedPriorityOrder(order: Order): PriorityOrder {
  const deadlineHour = Number(order.deadline.slice(6, 8));
  const reason =
    order.trust === "Rủi ro cao"
      ? "Địa chỉ độ tin cậy thấp"
      : order.total >= 250000
        ? "Đơn giá trị cao"
        : deadlineHour >= 13
          ? "Khách hẹn giờ nhận"
          : "Sắp quá SLA giao hẹn";
  const suggestion =
    reason === "Địa chỉ độ tin cậy thấp"
      ? "Xác nhận địa chỉ"
      : reason === "Đơn giá trị cao"
        ? "Xác nhận COD"
        : reason === "Khách hẹn giờ nhận"
          ? "Nhắc nhận hàng"
          : `Gọi trước ${order.deadline.slice(6)}`;
  return {
    id: order.id,
    channel: order.channel,
    customer: order.customer,
    phone: order.phone,
    deadline: order.deadline,
    product: `${order.productSku} x${order.quantity}`,
    eta: etaFromDeadline(order.deadline),
    suggestion,
    reason,
    callStatus: "Chờ gọi",
    assignStatus: "Chưa chia",
  };
}

export const PRIORITY_ORDERS: PriorityOrder[] = [
  ...EXPLICIT_PRIORITY_ORDERS,
  ...DERIVED_PRIORITY_IDS.map((id) => {
    const order = ORDERS.find((item) => item.id === id);
    if (!order) throw new Error(`Thieu don ${id} trong danh sach don`);
    return buildDerivedPriorityOrder(order);
  }),
];

export type WorkResult = "Đang gọi" | "Chờ gọi" | "Thành công" | "Thất bại";

export const WORK_RESULT_PILL: Record<WorkResult, string> = {
  "Đang gọi": "bg-gray-100 text-gray-700",
  "Chờ gọi": "bg-gray-100 text-gray-700",
  "Thành công": "bg-green-50 text-green-700",
  "Thất bại": "bg-red-50 text-red-700",
};

export type WorkItem = {
  id: string;
  channel: OrderChannel;
  customer: string;
  phone: string;
  deadline: string;
  duration: string | null;
  result: WorkResult;
};

// Danh sach don duoc phan cong cho Minh Anh (NV01), 6 dong trong khung.
// KPI ca (11 cuoc, 8 thanh cong, 3 that bai) lon hon so dong ve, giu nguyen
// so trong khung vi 5 cuoc con lai khong ve.
export const MINH_ANH_WORK: WorkItem[] = [
  { id: "DH-1044", channel: "Điện thoại", customer: "KH-033", phone: "0987 *** 210", deadline: "02/11 10:30", duration: "4p12", result: "Đang gọi" },
  { id: "DH-1051", channel: "Chat", customer: "KH-014", phone: "0912 *** 456", deadline: "02/11 10:00", duration: null, result: "Chờ gọi" },
  { id: "DH-1038", channel: "Chat", customer: "KH-041", phone: "0934 *** 902", deadline: "02/11 12:00", duration: null, result: "Chờ gọi" },
  { id: "DH-1029", channel: "Web", customer: "KH-019", phone: "0906 *** 443", deadline: "02/11 09:30", duration: "3p48", result: "Thành công" },
  { id: "DH-1024", channel: "Web", customer: "KH-022", phone: "0915 *** 887", deadline: "02/11 09:00", duration: "5p02", result: "Thất bại" },
  { id: "DH-1019", channel: "Web", customer: "KH-063", phone: "0905 *** 129", deadline: "02/11 15:00", duration: null, result: "Chờ gọi" },
];

export const MINH_ANH_SHIFT = { done: 11, assigned: 18, percent: 61 };
