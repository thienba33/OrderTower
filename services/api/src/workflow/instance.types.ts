// SPDX-License-Identifier: Apache-2.0

export type WorkflowInstanceStatus =
  | 'active'
  | 'suspended'
  | 'terminated'
  | 'completed';

export interface WorkflowInstanceHistoryEntry {
  from: string | null;
  to: string;
  by: string;
  role: string;
  at: string;
  reason?: string;
  handling?: string;
}

// Một lượt chạy của 1 định nghĩa luồng. Instance độc lập với thực thể nghiệp
// vụ dùng nó (đơn hàng, phiếu nhập, yêu cầu duyệt...): trạng thái và lịch sử
// của luồng sống ở đây, thực thể nghiệp vụ chỉ giữ businessKey và đọc lại.
export interface WorkflowInstance {
  id: string;
  definitionId: string;
  definitionVersion: string;
  // Mã của thực thể nghiệp vụ sở hữu instance, ví dụ mã đơn DH-1001.
  businessKey: string;
  currentState: string;
  status: WorkflowInstanceStatus;
  // Biến riêng của lượt chạy, ứng dụng khác tự định nghĩa, engine không đọc.
  context: Record<string, unknown>;
  history: WorkflowInstanceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface StartInstanceInput {
  definitionId: string;
  businessKey: string;
  actor: string;
  role: string;
  context?: Record<string, unknown>;
}

export interface TransitionInstanceInput {
  to: string;
  actor: string;
  role: string;
  reason?: string;
  handling?: string;
}

// Lối ra vào kho instance. Hiện có bản bộ nhớ; commit lưu bền Postgres sẽ
// thêm bản Postgres qua cùng interface này, service phía trên không đổi.
export interface WorkflowInstanceStore {
  save(instance: WorkflowInstance): void;
  findById(id: string): WorkflowInstance | null;
  findByBusinessKey(
    definitionId: string,
    businessKey: string,
  ): WorkflowInstance | null;
  list(): WorkflowInstance[];
}
