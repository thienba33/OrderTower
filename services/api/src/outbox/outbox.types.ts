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
  failed: number;
  eventIds: number[];
}
