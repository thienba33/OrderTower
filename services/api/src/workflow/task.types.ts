// SPDX-License-Identifier: Apache-2.0

export type WorkflowTaskSlaState = 'normal' | 'due-soon' | 'overdue';

export interface WorkflowTaskTransition {
  to: string;
  role: string;
  guard: string;
}

// Một việc đang chờ người dùng xử lý, suy ra từ workflow instance active và
// các transition mà vai của người dùng được phép thực hiện.
export interface WorkflowTask {
  id: string;
  instanceId: string;
  definitionId: string;
  definitionVersion: string;
  businessKey: string;
  currentState: string;
  availableTransitions: WorkflowTaskTransition[];
  dueAt: string | null;
  slaState: WorkflowTaskSlaState;
  ageMinutes: number;
  updatedAt: string;
}

export interface WorkflowTaskFilters {
  definitionId?: string;
  businessKey?: string;
  overdue?: boolean;
  limit?: number;
}
