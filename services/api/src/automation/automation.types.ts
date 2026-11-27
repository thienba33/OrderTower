// SPDX-License-Identifier: Apache-2.0

export type AutomationJobName = 'outbox-relay' | 'sla-scan';
export type AutomationTrigger = 'schedule' | 'manual';
export type AutomationRunStatus = 'success' | 'failed';

export interface AutomationRun {
  id: number;
  jobName: AutomationJobName;
  trigger: AutomationTrigger;
  status: AutomationRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: Record<string, unknown>;
  error: string | null;
}

export interface AutomationJobStatus {
  name: AutomationJobName;
  intervalMs: number;
  lastRun: AutomationRun | null;
}

export interface AutomationStatus {
  enabled: boolean;
  jobs: AutomationJobStatus[];
}
