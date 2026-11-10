// SPDX-License-Identifier: Apache-2.0

export interface OrderItem {
  sku: string;
  quantity: number;
}

export interface OrderHistoryEntry {
  from: string | null;
  to: string;
  by: string;
  role: string;
  at: string;
  reason?: string;
}

export interface Order {
  id: string;
  idempotencyKey: string;
  customer: string;
  items: OrderItem[];
  state: string;
  history: OrderHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  idempotencyKey: string;
  customer: string;
  items: OrderItem[];
  actor: string;
  role: string;
}

export interface TransitionOrderInput {
  to: string;
  actor: string;
  role: string;
  reason?: string;
}
