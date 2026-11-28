// SPDX-License-Identifier: Apache-2.0

// Loại đề xuất AI chia đơn: kho (theo đợt) hoặc telesale (từng cuộc).
// Telesale next không lưu đề xuất (chia từng cuộc, không duyệt theo đợt),
// nên bảng này hiện chỉ dùng cho kho.
export type ProposalKind = 'warehouse' | 'telesale';

// Vòng đời đề xuất: Chờ duyệt -> Đã áp dụng (áp dụng 1 lần) hoặc Đã từ chối;
// đề xuất vượt tải thì sang Chờ duyệt vượt tải để Quản lý/Quản trị viên
// duyệt ở Hàng đợi duyệt, rồi điều phối viên mới áp dụng được.
export type ProposalStatus =
  | 'Chờ duyệt'
  | 'Đã áp dụng'
  | 'Đã từ chối'
  | 'Chờ duyệt vượt tải';

// 1 mục đề xuất: 1 đơn giao cho 1 nhân viên, kèm lý do + số đầu vào để
// người duyệt kiểm tra lại được (kiểu giải thích của lớp BI).
export interface ProposalItem {
  orderId: string;
  assignedTo: string;
  reason: string;
  inputs: {
    active: number;
    completed: number;
    avgMinutes: number | null;
    score: number;
  };
  // Chỉ có giá trị ở luồng chia lại khi nghỉ đột xuất: mã phân đơn cũ cần
  // hủy trước khi tạo phân đơn mới.
  originalAssignmentId: string | null;
}

// Đơn bị bỏ qua khi đề xuất (không ở Chờ kho, hoặc đã có phân đơn kho đang
// hoạt động), kèm lý do để người duyệt biết.
export interface ProposalSkipped {
  orderId: string;
  reason: string;
}

// 1 đề xuất AI chia đơn kho: 1 đợt chia, duyệt cả đợt 1 lần.
export interface AiAssignmentProposal {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  items: ProposalItem[];
  skipped: ProposalSkipped[];
  // true khi áp dụng đúng như đề xuất sẽ đẩy ai đó lên từ 30 phân đơn kho
  // đang hoạt động trở lên (ngưỡng OVERLOAD_STANDARD).
  overloaded: boolean;
  // Mã phê duyệt vượt tải (khi status là Chờ duyệt vượt tải), null khi
  // không có. 1 phê duyệt chỉ dùng 1 lần khi áp dụng sau khi được duyệt.
  approvalId: string | null;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Lối ra vào kho đề xuất. Hiện có bản bộ nhớ; bản Postgres lưu bền qua cùng
// interface này, service phía trên không đổi.
export interface ProposalStore {
  save(proposal: AiAssignmentProposal): Promise<void>;
  findById(id: string): Promise<AiAssignmentProposal | null>;
  list(): Promise<AiAssignmentProposal[]>;
}
