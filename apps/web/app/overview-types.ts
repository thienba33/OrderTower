// SPDX-License-Identifier: Apache-2.0

// Hình dữ liệu đã tính cho màn Tổng quan: server tính từ API thật, client
// chỉ hiển thị và giữ state phân trang bảng SLA. Kiểu dữ liệu mẫu trong
// data/overview.ts là dữ liệu đóng băng nên không dùng lại ở đây.

export interface OverviewKpi {
  label: string;
  value: number;
}

export interface OrderFlowState {
  count: number;
  highlight: boolean;
  label: string;
}

export interface OverviewCountRow {
  count: number;
  label: string;
}

export interface SlaRiskRow {
  action: string;
  customer: string;
  deadline: string;
  id: string;
  risk: string;
  status: string;
}

export interface OverviewView {
  kpis: OverviewKpi[];
  flowStates: OrderFlowState[];
  approvalRows: OverviewCountRow[];
  pendingTotal: number;
  guardrailRows: OverviewCountRow[];
  guardrailTotal: number;
  slaRows: SlaRiskRow[];
}
