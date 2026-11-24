// SPDX-License-Identifier: Apache-2.0

// Trạng thái xử lý của 1 ticket CSKH. Ticket chỉ đi xuôi 1 bước mỗi lần:
// "Mới" -> "Đang xử lý" -> "Chờ khách" -> "Đã đóng", không nhảy cóc,
// không quay lại trạng thái trước.
export type TicketStatus = 'Mới' | 'Đang xử lý' | 'Chờ khách' | 'Đã đóng';

// Loại yêu cầu của ticket, lấy nguyên từ dữ liệu mẫu đóng băng
// (apps/web/data/cskh.ts, ngày 02/11/2026).
export type TicketType =
  | 'Giao trễ'
  | 'Hoàn hàng'
  | 'Đổi địa chỉ'
  | 'Xác nhận COD'
  | 'Hỏi sản phẩm';

// Kênh khách gửi yêu cầu, lấy nguyên từ dữ liệu mẫu đóng băng.
export type TicketChannel = 'Điện thoại' | 'Chat' | 'Web';

// Một ticket CSKH: 1 yêu cầu của khách gắn với 1 mã đơn. Mã đơn là chuỗi
// tự do, KHÔNG có khóa ngoại tới bảng orders: 14 dòng mẫu tham chiếu
// DH-1015 đến DH-1058, không tồn tại trong seed đơn (DH-1001..DH-1008
// và LS-1001..LS-1112), xem README và bản dự thảo mốc 3.
export interface Ticket {
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
  // Thời điểm đóng ticket, chỉ có khi trạng thái là "Đã đóng". KPI "Đã
  // đóng hôm nay" đếm theo trường này, không đếm theo số dòng "Đã đóng".
  closedAt: string | null;
}

export interface CreateTicketInput {
  customer: string;
  orderId: string;
  type: TicketType;
  channel: TicketChannel;
  content: string;
  // Ghi chú cần gọi lại lúc tạo mới: true thì ticket vào nhóm "chưa gọi
  // lại" dù loại không phải "Giao trễ". Không gửi thì needsCall mặc định
  // theo loại (xem TicketsService).
  needsCall?: boolean;
}

export interface ChangeTicketStatusInput {
  status: TicketStatus;
}

// 4 KPI đầu của màn CSKH, tính từ DB (KPI thứ 5, hoàn/trả chờ xử lý, đã
// nối API thật từ PR #59, không tính ở đây).
export interface TicketKpis {
  // Số ticket đang ở trạng thái "Mới".
  newRequests: number;
  // Số ticket đang ở trạng thái "Đang xử lý".
  inProgress: number;
  // Số ticket đang ở trạng thái "Chờ khách".
  waitingCustomer: number;
  // Số ticket đóng trong ngày hiện tại (theo giờ Việt Nam), không phải số
  // dòng đang ở trạng thái "Đã đóng".
  closedToday: number;
}

// Một dòng trong tệp seed tickets.seed.json: giữ nguyên từng giá trị của
// dữ liệu mẫu đóng băng. Trường updated là giờ cập nhật dạng HH:MM trong
// ngày 02/11/2026, lúc seed chuyển thành createdAt/updatedAt ISO.
export interface TicketSeedItem {
  id: string;
  customer: string;
  orderId: string;
  type: TicketType;
  channel: TicketChannel;
  content: string;
  status: TicketStatus;
  handler: string;
  updated: string;
  needsCall: boolean;
}

// Lối ra vào kho ticket. Hiện có bản bộ nhớ; bản Postgres lưu bền qua
// cùng interface này, service phía trên không đổi. Mọi phương thức đều bất
// đồng bộ vì kho Postgres cần chờ truy vấn.
export interface TicketStore {
  save(ticket: Ticket): Promise<void>;
  findById(id: string): Promise<Ticket | null>;
  list(): Promise<Ticket[]>;
}
