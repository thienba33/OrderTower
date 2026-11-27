// SPDX-License-Identifier: Apache-2.0

export type OutboxStatus = 'pending' | 'processed' | 'failed';

export interface OutboxEvent {
  id: number;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  processedAt: string | null;
  lastError: string | null;
}

export interface NewOutboxEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface OutboxFilters {
  status?: OutboxStatus;
  type?: string;
  limit?: number;
}

export interface OutboxRelayResult {
  processed: number;
  // Event lỗi đã hết max_attempts, nằm ở dead-letter.
  failed: number;
  // Event lỗi còn lượt, đã hẹn retry sau backoff.
  retried: number;
  eventIds: number[];
}

export type OutboxFailureOutcome = 'retry' | 'dead-letter';
