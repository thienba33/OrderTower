// SPDX-License-Identifier: Apache-2.0

// Đầu vào khi ghi 1 bản ghi audit. seq, prevHash và hash do AuditService tự tính.
export interface NewAuditRecord {
  actor: string;
  role: string;
  action: string;
  orderId: string;
  from?: string | null;
  to?: string | null;
  detail?: string;
  at?: string;
}

// Bản ghi audit chỉ ghi thêm: hash nối từ hash của bản ghi trước đó.
export interface AuditRecord {
  seq: number;
  at: string;
  actor: string;
  role: string;
  action: string;
  orderId: string;
  from: string | null;
  to: string | null;
  detail: string;
  prevHash: string;
  hash: string;
}

export interface AuditVerifyResult {
  valid: boolean;
  checked: number;
  // Số thứ tự của bản ghi đầu tiên bị hỏng, null khi chuỗi còn nguyên.
  brokenAt: number | null;
}
