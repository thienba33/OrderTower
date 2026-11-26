// SPDX-License-Identifier: Apache-2.0
import type { Queryable } from '../db/db.types';

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
  context?: Record<string, unknown>;
}

export interface TransitionInstanceInput {
  to: string;
  reason?: string;
  handling?: string;
}

// Lối ra vào kho instance. Hiện có bản bộ nhớ; bản Postgres lưu bền qua cùng
// interface này, service phía trên không đổi. Mọi phương thức đều bất đồng bộ
// vì kho Postgres cần chờ truy vấn.
export interface WorkflowInstanceStore {
  // client dùng để ghi/đọc trong transaction của service; forUpdate khóa
  // instance khi chuyển trạng thái.
  save(instance: WorkflowInstance, client?: Queryable): Promise<void>;
  findById(
    id: string,
    client?: Queryable,
    forUpdate?: boolean,
  ): Promise<WorkflowInstance | null>;
  findByBusinessKey(
    definitionId: string,
    businessKey: string,
    client?: Queryable,
    forUpdate?: boolean,
  ): Promise<WorkflowInstance | null>;
  list(): Promise<WorkflowInstance[]>;
}

// Lỗi nghiệp vụ khi transition bị từ chối trong transaction ngoài. Service
// ngoài bắt lỗi này để ghi audit denial sau khi transaction đã rollback,
// tránh giữ khóa hàng trong lúc chờ ghi audit.
export class WorkflowTransitionDeniedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'WorkflowTransitionDeniedError';
  }
}
