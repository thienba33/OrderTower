// SPDX-License-Identifier: Apache-2.0

export type ArchiveRunStatus = 'completed' | 'failed';

export interface ApiArchiveRun {
  id: string;
  dataset: string;
  cutoffAt: string;
  objectKey: string | null;
  rowCount: number;
  bytes: number;
  status: ArchiveRunStatus;
  error: string | null;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
}

export interface ApiArchiveSummary {
  ordersInOltp: number;
  archivedOrders: number;
  runCount: number;
  coldBytes: number;
  lastRun: ApiArchiveRun | null;
}

export interface ApiColdGroup {
  key: string;
  count: number;
  revenue: number;
}

export interface ApiColdOrderRow {
  tenantId: string;
  orderId: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  channelId: string;
  customerId: string;
  itemCount: number;
  itemsJson: string;
}

export interface ApiColdAnalytics {
  source: 'parquet';
  runs: number;
  rows: number;
  totalRevenue: number;
  byState: ApiColdGroup[];
  byChannel: ApiColdGroup[];
  byDay: ApiColdGroup[];
  sample: ApiColdOrderRow[];
}
