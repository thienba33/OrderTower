// SPDX-License-Identifier: Apache-2.0

// Loại phân đơn: gọi điện chăm sóc khách (telesale) hoặc đóng gói ở kho.
export type AssignmentKind = 'telesale' | 'warehouse';

// Trạng thái xử lý của 1 phân đơn. Chỉ 2 trạng thái đầu là đang hoạt
// động: đơn đã có phân đơn ở 1 trong 2 trạng thái này (theo từng loại)
// thì không tạo thêm phân đơn cùng loại cho đơn đó.
export type AssignmentStatus =
  | 'Chờ xử lý'
  | 'Đang xử lý'
  | 'Hoàn thành'
  | 'Đã hủy';

// Một phân đơn: điều phối viên giao 1 đơn cho 1 tài khoản (tên đăng nhập
// Keycloak) để gọi điện (telesale) hoặc để đóng gói (kho). Người nhận ghi
// nhận bằng bắt đầu xử lý; phân đơn kho hoàn thành bằng nút hoàn thành,
// phân đơn telesale hoàn thành bằng cách ghi nhật ký cuộc gọi.
export interface Assignment {
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

export interface CreateAssignmentInput {
  orderId: string;
  kind: AssignmentKind;
  assignedTo: string;
}

export interface CancelAssignmentInput {
  reason: string;
}

// Lối ra vào kho phân đơn. Hiện có bản bộ nhớ; bản Postgres lưu bền qua
// cùng interface này, service phía trên không đổi. Mọi phương thức đều bất
// đồng bộ vì kho Postgres cần chờ truy vấn.
export interface AssignmentStore {
  save(assignment: Assignment): Promise<void>;
  findById(id: string): Promise<Assignment | null>;
  findByOrderIdAndKind(
    orderId: string,
    kind: AssignmentKind,
  ): Promise<Assignment[]>;
  list(): Promise<Assignment[]>;
}

// Kết quả 1 cuộc gọi: chỉ có thành công hoặc thất bại, không có kết quả
// dở dang, vì cuộc gọi chỉ ghi nhận khi đã gọi xong.
export type CallResult = 'Thành công' | 'Thất bại';

// Một nhật ký cuộc gọi: nhân viên CSKH ghi lại kết quả gọi cho đơn được
// phân. Ghi nhật ký xong thì phân đơn telesale đó tự sang "Hoàn thành".
export interface CallLog {
  id: string;
  assignmentId: string;
  orderId: string;
  caller: string;
  result: CallResult;
  durationSeconds: number;
  note: string | null;
  createdAt: string;
}

export interface CreateCallLogInput {
  assignmentId: string;
  result: CallResult;
  durationSeconds: number;
  note?: string;
}

// Lối ra vào kho nhật ký cuộc gọi, cùng cách tổ chức như AssignmentStore.
export interface CallLogStore {
  save(log: CallLog): Promise<void>;
  findById(id: string): Promise<CallLog | null>;
  findByAssignmentId(assignmentId: string): Promise<CallLog[]>;
  list(): Promise<CallLog[]>;
}
