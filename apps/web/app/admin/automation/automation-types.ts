// SPDX-License-Identifier: Apache-2.0

export const RUN_PAGE_SIZE = 10;
export const NOTIFICATION_PAGE_SIZE = 8;

export type ApiAutomationJobName = "outbox-relay" | "sla-scan";
export type ApiAutomationTrigger = "schedule" | "manual";
export type ApiAutomationRunStatus = "success" | "failed";

export interface ApiAutomationRun {
  id: number;
  jobName: ApiAutomationJobName;
  trigger: ApiAutomationTrigger;
  status: ApiAutomationRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: Record<string, unknown>;
  error: string | null;
}

export interface ApiAutomationRunPage {
  items: ApiAutomationRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiAutomationJob {
  name: ApiAutomationJobName;
  intervalMs: number;
  lastRun: ApiAutomationRun | null;
}

export interface ApiAutomationStatus {
  enabled: boolean;
  jobs: ApiAutomationJob[];
}
