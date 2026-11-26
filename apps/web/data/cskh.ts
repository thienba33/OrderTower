// SPDX-License-Identifier: Apache-2.0

// Dữ liệu mẫu đóng băng ngày 02/11/2026 cho màn Chăm sóc khách hàng.
// 6 dòng trang 1 là dữ liệu mẫu cố định; 8 dòng còn lại sinh xác định để đủ
// 14 bản ghi, không dùng số ngẫu nhiên, chạy lại vẫn ra cùng một danh sách.
// Chưa nối hệ thống thật.
// Lưu ý: 3 chỉ số trạng thái trên thẻ KPI cộng lại là 14 (5 + 6 + 3) trong
// khi trang 1 của bảng đã có 2 dòng "Đã đóng". Bản này giữ nguyên các số
// trên thẻ KPI như thiết kế (không tính lại từ bảng) và giữ nguyên 6 dòng
// trang 1; "Đã đóng hôm nay 8" là số đóng trong ngày, không phải số dòng
// "Đã đóng" trong bảng 14 bản ghi.

export type TicketStatus = "Mới" | "Đang xử lý" | "Chờ khách" | "Đã đóng";

export type TicketType =
  | "Giao trễ"
  | "Hoàn hàng"
  | "Đổi địa chỉ"
  | "Xác nhận COD"
  | "Hỏi sản phẩm";

export type TicketChannel = "Điện thoại" | "Chat" | "Web";

export interface TicketRow {
  id: string;
  customer: string;
  orderId: string;
  type: TicketType;
  channel: TicketChannel;
  content: string;
  status: TicketStatus;
  handler: string;
  updated: string; // Giờ cập nhật, dạng HH:MM trong ngày 02/11/2026
  needsCall: boolean; // Thuộc nhóm "chưa gọi lại" trên banner cảnh báo
}

export const TICKET_STATUSES: TicketStatus[] = [
  "Mới",
  "Đang xử lý",
  "Chờ khách",
  "Đã đóng",
];

export const TICKET_TYPES: TicketType[] = [
  "Giao trễ",
  "Hoàn hàng",
  "Đổi địa chỉ",
  "Xác nhận COD",
  "Hỏi sản phẩm",
];

export const TICKET_CHANNELS: TicketChannel[] = ["Điện thoại", "Chat", "Web"];

// Thẻ KPI giữ đúng số trong thiết kế, không tính lại từ bảng (xem ghi chú
// ở đầu file). Thẻ "Hoàn / trả chờ xử lý" khớp với bảng hoàn hàng theo kênh.
export const CSKH_KPIS: { label: string; value: number }[] = [
  { label: "Yêu cầu mới", value: 5 },
  { label: "Đang xử lý", value: 6 },
  { label: "Chờ khách phản hồi", value: 3 },
  { label: "Đã đóng hôm nay", value: 8 },
  { label: "Hoàn / trả chờ xử lý", value: 10 },
];

export const TICKET_STATUS_PILL: Record<TicketStatus, string> = {
  "Mới": "bg-red-50 text-red-700",
  "Đang xử lý": "bg-amber-50 text-amber-800",
  "Chờ khách": "bg-yellow-50 text-yellow-800",
  "Đã đóng": "bg-green-50 text-green-700",
};

// 6 dòng trên trang 1 của thiết kế, giữ nguyên từng giá trị.
const EXPLICIT_ROWS: TicketRow[] = [
  { id: "YC-031", customer: "KH-033", orderId: "DH-1044", type: "Giao trễ", channel: "Điện thoại", content: "Khách hỏi mốc giao 10:30, đơn đang giao", status: "Đang xử lý", handler: "Mai", updated: "09:48", needsCall: true },
  { id: "YC-030", customer: "KH-058", orderId: "DH-1033", type: "Hoàn hàng", channel: "Chat", content: "Hoàn 1 chai NM-25, lý do vỡ khi giao", status: "Mới", handler: "Chưa gán", updated: "09:31", needsCall: true },
  { id: "YC-029", customer: "KH-027", orderId: "DH-1041", type: "Đổi địa chỉ", channel: "Web", content: "Khách đổi địa chỉ, chờ duyệt hiệu chỉnh", status: "Chờ khách", handler: "Mai", updated: "09:12", needsCall: false },
  { id: "YC-028", customer: "KH-014", orderId: "DH-1051", type: "Xác nhận COD", channel: "Chat", content: "Khách xác nhận COD 186.000đ", status: "Đã đóng", handler: "Thu Hằng", updated: "08:57", needsCall: false },
  { id: "YC-027", customer: "KH-041", orderId: "DH-1038", type: "Đổi địa chỉ", channel: "Chat", content: "Khách xác nhận địa chỉ qua điện thoại", status: "Đang xử lý", handler: "Minh Anh", updated: "08:44", needsCall: false },
  { id: "YC-026", customer: "KH-019", orderId: "DH-1029", type: "Hỏi sản phẩm", channel: "Web", content: "Hỏi hạn dùng lô H-052", status: "Đã đóng", handler: "Mai", updated: "08:20", needsCall: false },
];

// 8 dòng còn lại để đủ 14 bản ghi. Số đếm trên banner được tính lại từ
// chính bảng này: loại "Giao trễ" có 4 dòng (YC-031, YC-025, YC-022,
// YC-019), nhóm "chưa gọi lại" có 6 dòng (YC-031, YC-030, YC-025, YC-024,
// YC-022, YC-019).
const DERIVED_ROWS: TicketRow[] = [
  { id: "YC-025", customer: "KH-072", orderId: "DH-1047", type: "Giao trễ", channel: "Điện thoại", content: "Khách hỏi mốc giao 14:00, đơn đang ở kho", status: "Đang xử lý", handler: "Mai", updated: "08:05", needsCall: true },
  { id: "YC-024", customer: "KH-011", orderId: "DH-1022", type: "Hoàn hàng", channel: "Chat", content: "Hoàn 2 chai NM-40, lý do giao sai địa chỉ", status: "Mới", handler: "Chưa gán", updated: "07:58", needsCall: true },
  { id: "YC-023", customer: "KH-049", orderId: "DH-1055", type: "Hỏi sản phẩm", channel: "Web", content: "Hỏi hạn dùng lô L-121 và cách bảo quản", status: "Đã đóng", handler: "Thu Hằng", updated: "07:47", needsCall: false },
  { id: "YC-022", customer: "KH-036", orderId: "DH-1035", type: "Giao trễ", channel: "Chat", content: "Khách hỏi vì sao đơn chưa giao sau 2 ngày", status: "Mới", handler: "Chưa gán", updated: "07:39", needsCall: true },
  { id: "YC-021", customer: "KH-064", orderId: "DH-1049", type: "Đổi địa chỉ", channel: "Điện thoại", content: "Khách đổi số nhà, chờ duyệt hiệu chỉnh", status: "Chờ khách", handler: "Minh Anh", updated: "07:26", needsCall: false },
  { id: "YC-020", customer: "KH-008", orderId: "DH-1018", type: "Xác nhận COD", channel: "Web", content: "Khách xác nhận COD 240.000đ", status: "Đang xử lý", handler: "Mai", updated: "07:15", needsCall: false },
  { id: "YC-019", customer: "KH-077", orderId: "DH-1058", type: "Giao trễ", channel: "Điện thoại", content: "Khách hỏi mốc giao buổi chiều, đơn đang giao", status: "Chờ khách", handler: "Thu Hằng", updated: "07:02", needsCall: true },
  { id: "YC-018", customer: "KH-022", orderId: "DH-1015", type: "Hỏi sản phẩm", channel: "Chat", content: "Hỏi giá sỉ 10 chai NM-25 cho quán ăn", status: "Mới", handler: "Chưa gán", updated: "06:48", needsCall: false },
];

export const TICKET_ROWS: TicketRow[] = [...EXPLICIT_ROWS, ...DERIVED_ROWS];

export interface ReturnChannelRow {
  channel: TicketChannel;
  returns: number;
  orders: number;
  percent: number;
}

// Hoàn hàng theo kênh: 9 + 1 + 0 = 10 đơn hoàn, 50 + 48 + 22 = 120 đơn.
export const RETURN_CHANNELS: ReturnChannelRow[] = [
  { channel: "Chat", returns: 9, orders: 50, percent: 18 },
  { channel: "Web", returns: 1, orders: 48, percent: 2 },
  { channel: "Điện thoại", returns: 0, orders: 22, percent: 0 },
];

export interface ContactHistoryRow {
  time: string;
  customer: string;
  channel: TicketChannel;
  result: string;
  note: string;
}

// 4 dòng lịch sử liên hệ gần đây trong thiết kế, giữ nguyên từng giá trị.
export const CONTACT_HISTORY: ContactHistoryRow[] = [
  { time: "09:48", customer: "KH-033", channel: "Điện thoại", result: "Thành công", note: "Khách xác nhận nhận hàng trong khung 10:00-10:30, đơn DH-1044 đang giao." },
  { time: "09:31", customer: "KH-058", channel: "Chat", result: "Không liên lạc được", note: "Đã nhắn 2 lần, hẹn gọi lại 11:00, đơn DH-1033 chờ kho." },
  { time: "09:12", customer: "KH-027", channel: "Web", result: "Thành công", note: "Khách xác nhận địa chỉ mới, chuyển chờ duyệt hiệu chỉnh, đơn DH-1041." },
  { time: "08:57", customer: "KH-014", channel: "Chat", result: "Thành công", note: "Khách xác nhận COD, đơn DH-1051 chờ điều xe." },
];
