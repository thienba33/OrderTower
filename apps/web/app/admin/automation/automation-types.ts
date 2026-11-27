// SPDX-License-Identifier: Apache-2.0

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

export interface ApiAutomationJob {
  name: ApiAutomationJobName;
  intervalMs: number;
  lastRun: ApiAutomationRun | null;
}

export interface ApiAutomationStatus {
  enabled: boolean;
  jobs: ApiAutomationJob[];
}
