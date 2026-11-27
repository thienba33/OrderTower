// SPDX-License-Identifier: Apache-2.0

export interface ApiLineageRatio {
  key: string;
  label: string;
  value: number | null;
  n: number;
  measured: boolean;
  note: string;
}

export interface ApiLineageAxis {
  axis: "P" | "D" | "I" | "H";
  score: number;
  maxScore: number;
  ratios: ApiLineageRatio[];
}

export interface ApiLineageRecommendation {
  id: string;
  anomalyKey: string;
  type: string;
  sku: string | null;
  channelId: string | null;
  status: string;
  createdAt: string;
  inputs: Record<string, number | string | null>;
}

export interface ApiLineageFeedback {
  id: string;
  recommendationId: string;
  correct: boolean;
  recordedAt: string;
}

export interface ApiLineageOrder {
  id: string;
  state: string;
  updatedAt: string;
}

export interface ApiLineageAudit {
  seq: number;
  action: string;
  orderId: string | null;
  at: string;
}

export interface ApiLineageArchive {
  orderId: string;
  archiveKey: string;
  archivedAt: string;
  runId: string | null;
  rowCount: number;
}

export interface ApiLineageCoverage {
  axis: "P" | "D" | "I" | "H";
  measured: number;
  total: number;
}

export interface ApiBiLineage {
  snapshot: {
    id: string;
    formulaVersion: string;
    referenceDate: string;
    computedAt: string;
    total: number;
  };
  axes: ApiLineageAxis[];
  sources: {
    recommendations: ApiLineageRecommendation[];
    feedback: ApiLineageFeedback[];
    orders: ApiLineageOrder[];
    audit: ApiLineageAudit[];
    archive: ApiLineageArchive[];
  };
  coverage: ApiLineageCoverage[];
}
