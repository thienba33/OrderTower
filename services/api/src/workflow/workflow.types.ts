// SPDX-License-Identifier: Apache-2.0

// Kiểu của tệp định nghĩa luồng, xem services/api/src/workflow/definitions/.
export interface WorkflowTransition {
  from: string;
  to: string;
  role: string;
  guard: string;
}

export interface WorkflowDefinition {
  definitionId: string;
  version: string;
  note?: string;
  states: string[];
  transitions: WorkflowTransition[];
  guards: string[];
  approvals: string[];
}

// Kết quả kiểm tra 1 lần chuyển trạng thái.
export interface TransitionCheck {
  allowed: boolean;
  // Vai được phép chuyển theo định nghĩa, null khi không có chuyển nào khớp.
  requiredRole: string | null;
  // Lý do từ chối, null khi được phép.
  reason: string | null;
}
