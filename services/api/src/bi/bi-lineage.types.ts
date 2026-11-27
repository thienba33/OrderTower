// SPDX-License-Identifier: Apache-2.0

// Phả hệ dữ liệu của một snapshot DX-Score. Chỉ trả ID/trạng thái/counts,
// không trả phone/address/tên khách hàng hay audit detail.
export interface LineageRatio {
  key: string;
  label: string;
  value: number | null;
  n: number;
  measured: boolean;
  note: string;
}

export interface LineageAxis {
  axis: 'P' | 'D' | 'I' | 'H';
  score: number;
  maxScore: number;
  ratios: LineageRatio[];
}

export interface LineageRecommendationRef {
  id: string;
  anomalyKey: string;
  type: string;
  sku: string | null;
  channelId: string | null;
  status: string;
  createdAt: string;
  inputs: Record<string, number | string | null>;
}

export interface LineageFeedbackRef {
  id: string;
  recommendationId: string;
  correct: boolean;
  recordedAt: string;
}

export interface LineageOrderRef {
  id: string;
  state: string;
  updatedAt: string;
}

export interface LineageAuditRef {
  seq: number;
  action: string;
  orderId: string | null;
  at: string;
}

export interface LineageArchiveRef {
  orderId: string;
  archiveKey: string;
  archivedAt: string;
  runId: string | null;
  rowCount: number;
}

export interface LineageCoverage {
  axis: 'P' | 'D' | 'I' | 'H';
  measured: number;
  total: number;
}

export interface BiLineage {
  snapshot: {
    id: string;
    formulaVersion: string;
    referenceDate: string;
    computedAt: string;
    total: number;
  };
  axes: LineageAxis[];
  sources: {
    recommendations: LineageRecommendationRef[];
    feedback: LineageFeedbackRef[];
    orders: LineageOrderRef[];
    audit: LineageAuditRef[];
    archive: LineageArchiveRef[];
  };
  coverage: LineageCoverage[];
}
