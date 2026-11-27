// SPDX-License-Identifier: Apache-2.0

import type {
  ApiArchiveSummary,
  ApiColdAnalytics,
} from "../cold-data/cold-data-types";
import type { ApiBiLineage } from "./bi-lineage-types";

// Kiểu dữ liệu API BI (so khớp services/api/src/bi/bi.types.ts) và prop
// của màn BI và DX-Score. Màn giữ nguyên bố cục đóng băng, chỉ thay dữ
// liệu mẫu bằng dữ liệu thật từ API BI.

export type BiTab =
  | "Tổng quan"
  | "Thực tế"
  | "Dự báo"
  | "Kênh bán"
  | "Tồn kho"
  | "Cảnh báo"
  | "Hoạt động";

export const BI_TABS: BiTab[] = [
  "Tổng quan",
  "Thực tế",
  "Dự báo",
  "Kênh bán",
  "Tồn kho",
  "Cảnh báo",
  "Hoạt động",
];

export interface ApiForecastRow {
  sku: string;
  name: string | null;
  channelId: string | null;
  salesLast7d: number;
  salesPrev7d: number;
  velocityPerDay: number;
  forecast7d: number;
  stock: number;
  unitPrice: number | null;
  daysLeft: number | null;
  status: "binh-thuong" | "khong-ban";
}

export type ApiAnomalyType =
  | "ton-kho-sap-het"
  | "ty-le-hoan-cao"
  | "cau-tang-dot-bien";

export interface ApiAnomaly {
  key: string;
  type: ApiAnomalyType;
  sku: string | null;
  channelId: string | null;
  title: string;
  detail: string;
  inputs: Record<string, number | string | null>;
  referenceDate: string;
}

export type ApiRecommendationStatus = "Chờ duyệt" | "Đã duyệt" | "Đã từ chối";

export interface ApiRecommendation {
  id: string;
  anomalyKey: string;
  type: ApiAnomalyType;
  sku: string | null;
  channelId: string | null;
  title: string;
  action: string;
  reason: string;
  inputs: Record<string, number | string | null>;
  status: ApiRecommendationStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiFeedback {
  id: string;
  recommendationId: string;
  correct: boolean;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface ApiDxRatio {
  value: number | null;
  n: number;
  measured: boolean;
  note: string;
}

export interface ApiDxScore {
  formulaVersion: "v1";
  referenceDate: string;
  computedAt: string;
  p: {
    score: number;
    closedWithoutDetour: ApiDxRatio;
    illegalBlocked: ApiDxRatio;
  };
  d: {
    score: number;
    attributedIndicators: ApiDxRatio;
    fullLineage: ApiDxRatio;
  };
  i: {
    score: number;
    correctApproved: ApiDxRatio;
    smallSample: boolean;
  };
  h: {
    score: number;
    manualStepRatio: ApiDxRatio;
    avgApprovalWaitMsByType: { type: string; avgMs: number; n: number }[];
    decisionsPerPersonPerDayByRole: {
      role: string;
      date: string;
      count: number;
    }[];
    exceptionRatio: ApiDxRatio;
  };
  total: number;
}

export interface ApiDxScoreSnapshot extends ApiDxScore {
  id: string;
}

export type BiSectionError = "unauthorized" | "load-failed";

export interface BiDxScoreClientProps {
  forecastRows: ApiForecastRow[];
  channelNameById: Record<string, string>;
  anomalies: ApiAnomaly[];
  recommendations: ApiRecommendation[];
  feedback: ApiFeedback[];
  dxScore: ApiDxScore | null;
  latestSnapshot: ApiDxScoreSnapshot | null;
  forecastError: BiSectionError | null;
  biError: BiSectionError | null;
  dxError: BiSectionError | null;
  archiveSummary: ApiArchiveSummary | null;
  coldAnalytics: ApiColdAnalytics | null;
  coldError: BiSectionError | null;
  lineage: ApiBiLineage | null;
  lineageError: BiSectionError | null;
  roles: string[];
}
