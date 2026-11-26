// SPDX-License-Identifier: Apache-2.0

import type {
  TicketChannel,
  TicketStatus,
  TicketType,
} from "../../data/cskh";

// Hình API của trả hàng, phân đơn gọi điện và nhật ký cuộc gọi, chỉ lấy
// trường màn Chăm sóc khách hàng dùng. Kiểu ReturnChannelRow trong
// data/cskh.ts là dữ liệu mẫu đóng băng nên không dùng lại ở đây; panel
// hoàn hàng theo kênh đọc API thật, không import RETURN_CHANNELS nữa.
// Đơn/kênh/tồn kho lấy từ app/orders/orders-types.ts (hình đầy đủ của
// API), không định nghĩa lại ở đây.

// Một ticket CSKH từ API: giống dòng TicketRow trong data/cskh.ts nhưng
// giờ cập nhật là ISO (updatedAt) thay vì HH:MM, cộng thêm người tạo và
// thời điểm đóng. Mã đơn là chuỗi tự do, không có khóa ngoại tới đơn.
export interface ApiTicket {
  id: string;
  customer: string;
  orderId: string;
  type: TicketType;
  channel: TicketChannel;
  content: string;
  status: TicketStatus;
  handler: string;
  needsCall: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

// 4 KPI đầu của màn CSKH, tính từ DB (KPI thứ 5, hoàn/trả chờ xử lý, đã
// nối API thật từ PR #59, không tính ở đây).
export interface ApiTicketKpis {
  newRequests: number;
  inProgress: number;
  waitingCustomer: number;
  closedToday: number;
}

// Lỗi tải ticket: hết phiên thì hiện link đăng nhập lại, lỗi khác thì
// báo tải lại trang. null là tải được. Cùng quy ước như ReturnsError
// của panel hoàn hàng.
export type TicketsError = "unauthorized" | "load-failed";

export type ApiReturnStatus =
  | "Chờ xử lý"
  | "Đã duyệt"
  | "Đã từ chối"
  | "Đã hoàn tiền";

export interface ApiReturn {
  id: string;
  orderId: string;
  status: ApiReturnStatus;
}

// Hoàn hàng của 1 kênh, tính từ API: số đơn của kênh, số trả hàng của
// các đơn đó, tỷ lệ làm tròn phần trăm.
export interface ReturnChannelStat {
  channel: string;
  returns: number;
  orders: number;
  percent: number;
}

// Lỗi tải dữ liệu hoàn hàng: hết phiên thì hiện link đăng nhập lại,
// lỗi khác thì báo tải lại trang. null là tải được.
export type ReturnsError = "unauthorized" | "load-failed";

// Một dòng trong danh sách đơn nên ưu tiên gọi, tính sẵn ở server từ API
// thật (đơn + kênh + tồn kho). ETA tính từ mốc giao hẹn trừ thời điểm tải
// trang, không phải mốc 07:30 như dữ liệu mẫu đóng băng. Chuyển từ màn
// Telesale cũ sang khi gộp 2 màn thành 1 màn Chăm sóc khách hàng.
export interface PriorityRow {
  id: string;
  channel: string;
  customer: string;
  phone: string;
  // Mốc giao hẹn dạng "DD/MM HH:mm" giờ Việt Nam, "-" khi đơn không có.
  deadline: string;
  // Sản phẩm dạng "Tên xN" nối nhau, tên lấy từ tồn kho, SKU khi chưa biết tên.
  product: string;
  // "Quá hạn" khi mốc giao đã qua, "XhYY" khi còn hạn, "-" khi không có mốc.
  eta: string;
  // Số phút còn lại tới mốc giao hẹn, -1 khi đã quá hạn, null khi không có mốc.
  // Dùng để sắp xếp theo ETA (quá hạn lên trước, không có mốc xuống cuối).
  etaMinutes: number | null;
  suggestion: string;
  reason: string;
}

export type AssignmentKind = "telesale" | "warehouse";

export type AssignmentStatus =
  | "Chờ xử lý"
  | "Đang xử lý"
  | "Hoàn thành"
  | "Đã hủy";

// Phân đơn: điều phối viên giao 1 đơn cho 1 tài khoản để gọi điện
// (telesale) hoặc để đóng gói (kho). Màn này chỉ hiện và thao tác phân
// đơn gọi điện; phân đơn kho thuộc màn Kho và tồn kho.
export interface ApiAssignment {
  id: string;
  orderId: string;
  kind: AssignmentKind;
  assignedTo: string;
  assignedBy: string;
  status: AssignmentStatus;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CallResult = "Thành công" | "Thất bại";

// Nhật ký cuộc gọi: CSKH ghi lại kết quả 1 cuộc gọi cho đơn được phân
// telesale. Ghi xong thì phân đơn đó tự sang "Hoàn thành".
export interface ApiCallLog {
  id: string;
  assignmentId: string;
  orderId: string;
  caller: string;
  result: CallResult;
  durationSeconds: number;
  note: string | null;
  createdAt: string;
}

// Lỗi tải dữ liệu cuộc gọi: hết phiên thì hiện link đăng nhập lại, lỗi
// khác thì báo tải lại trang. null là tải được. Cùng quy ước như
// ReturnsError của panel hoàn hàng.
export type CallsError = "unauthorized" | "load-failed";

// Tài khoản CSKH demo để điều phối viên chọn khi chia đơn gọi điện.
// demo.cskh-2/3/4 là tài khoản dự kiến tạo thêm trên Keycloak, lúc mới
// triển khai có thể chưa có trên máy demo; chọn tài khoản chưa tạo thì
// API vẫn tạo phân đơn vì API không kiểm tra tài khoản có thật không.
export const DEMO_CSKH_ACCOUNTS: readonly string[] = [
  "demo.customer-service",
  "demo.cskh-2",
  "demo.cskh-3",
  "demo.cskh-4",
];
