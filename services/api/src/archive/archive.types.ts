// SPDX-License-Identifier: Apache-2.0

export type ArchiveRunStatus = 'completed' | 'failed';

// Mot lan export don da dong ra Parquet. objectKey null khi run failed.
export interface ArchiveRun {
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

export interface ArchiveRunResult {
  run: ArchiveRun | null;
  archived: number;
}

export interface ArchiveInput {
  olderThanDays?: unknown;
  limit?: unknown;
}

// Mot dong don trong Parquet. Khong chua PII tho (phone/address/customer name).
export interface ColdOrderRow {
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

export interface ColdGroup {
  key: string;
  count: number;
  revenue: number;
}

export interface ColdAnalytics {
  source: 'parquet';
  runs: number;
  rows: number;
  totalRevenue: number;
  byState: ColdGroup[];
  byChannel: ColdGroup[];
  byDay: ColdGroup[];
  sample: ColdOrderRow[];
}

export interface ArchiveSummary {
  ordersInOltp: number;
  archivedOrders: number;
  runCount: number;
  coldBytes: number;
  lastRun: ArchiveRun | null;
}

// Kho manifest/run. Postgres o runtime; in-memory cho unit test.
export interface ArchiveStore {
  saveRun(run: ArchiveRun): Promise<void>;
  saveRunWithManifests(run: ArchiveRun, orderIds: string[]): Promise<void>;
  listRuns(limit: number): Promise<ArchiveRun[]>;
  latestRun(): Promise<ArchiveRun | null>;
  countRuns(): Promise<number>;
  listArchivedOrderIds(): Promise<Set<string>>;
  countArchived(): Promise<number>;
  listCompletedRuns(): Promise<ArchiveRun[]>;
}
