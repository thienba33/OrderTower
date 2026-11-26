// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { isDriverOnly } from '../auth/permissions';
import type { Caller } from '../auth/auth.types';
import { DbService } from '../db/db.service';
import type { WorkflowInstance } from './instance.types';
import { WorkflowInstanceService } from './instance.service';
import type {
  WorkflowTask,
  WorkflowTaskFilters,
  WorkflowTaskSlaState,
  WorkflowTaskTransition,
} from './task.types';
import { WorkflowService } from './workflow.service';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DUE_SOON_MS = 24 * 60 * 60 * 1000;
const ORDER_DEFINITION_ID = 'order-flow';

function parseTime(value: unknown): number {
  if (typeof value !== 'string' || value.trim() === '') {
    return Number.NaN;
  }
  return Date.parse(value);
}

function taskSlaState(
  dueAt: string | null,
  nowMs: number,
): WorkflowTaskSlaState {
  const dueMs = parseTime(dueAt);
  if (!Number.isFinite(dueMs)) {
    return 'normal';
  }
  if (dueMs <= nowMs) {
    return 'overdue';
  }
  if (dueMs - nowMs <= DUE_SOON_MS) {
    return 'due-soon';
  }
  return 'normal';
}

function contextDeadline(instance: WorkflowInstance): string | null {
  const value = instance.context.deadline;
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

@Injectable()
export class WorkflowTaskService {
  private readonly logger = new Logger(WorkflowTaskService.name);

  constructor(
    private readonly workflow: WorkflowService,
    private readonly instances: WorkflowInstanceService,
    @Optional()
    private readonly db?: DbService,
  ) {}

  async list(
    caller: Caller,
    filters: WorkflowTaskFilters,
    at: Date = new Date(),
  ): Promise<WorkflowTask[]> {
    const limit = filters.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`,
      );
    }

    let instances = await this.instances.list({
      status: 'active',
      ...(filters.definitionId ? { definitionId: filters.definitionId } : {}),
      ...(filters.businessKey ? { businessKey: filters.businessKey } : {}),
    });

    // Tài xế chỉ thấy việc của đơn mình phụ trách. Không có DB để đối chiếu
    // thì trả rỗng thay vì lộ việc của tài xế khác.
    if (isDriverOnly(caller.roles)) {
      const allowed = await this.driverOrderIds(caller.username);
      instances = instances.filter((instance) => allowed.has(instance.businessKey));
    }

    const deadlines = await this.orderDeadlines();
    const nowMs = at.getTime();
    const tasks: WorkflowTask[] = [];

    for (const instance of instances) {
      const transitions = this.workflow
        .getTransitions(instance.definitionId, instance.definitionVersion)
        .filter(
          (transition) =>
            transition.from === instance.currentState &&
            caller.roles.includes(transition.role),
        );
      if (transitions.length === 0) {
        continue;
      }
      const dueAt =
        deadlines.get(instance.businessKey) ?? contextDeadline(instance);
      const slaState = taskSlaState(dueAt, nowMs);
      if (filters.overdue === true && slaState !== 'overdue') {
        continue;
      }
      const updatedMs = parseTime(instance.updatedAt);
      tasks.push({
        id: instance.id,
        instanceId: instance.id,
        definitionId: instance.definitionId,
        definitionVersion: instance.definitionVersion,
        businessKey: instance.businessKey,
        currentState: instance.currentState,
        availableTransitions: transitions.map((transition) => ({
          to: transition.to,
          role: transition.role,
          guard: transition.guard,
        })),
        dueAt,
        slaState,
        ageMinutes: Number.isFinite(updatedMs)
          ? Math.max(0, Math.floor((nowMs - updatedMs) / 60000))
          : 0,
        updatedAt: instance.updatedAt,
      });
    }

    const rank: Record<WorkflowTaskSlaState, number> = {
      overdue: 0,
      'due-soon': 1,
      normal: 2,
    };
    return tasks
      .sort((a, b) => {
        if (rank[a.slaState] !== rank[b.slaState]) {
          return rank[a.slaState] - rank[b.slaState];
        }
        const dueA = parseTime(a.dueAt);
        const dueB = parseTime(b.dueAt);
        if (Number.isFinite(dueA) && Number.isFinite(dueB) && dueA !== dueB) {
          return dueA - dueB;
        }
        return a.updatedAt.localeCompare(b.updatedAt);
      })
      .slice(0, limit);
  }

  private async orderDeadlines(): Promise<Map<string, string>> {
    if (!this.db) {
      return new Map();
    }
    try {
      const result = await this.db.query(
        'SELECT id, deadline FROM orders WHERE deadline IS NOT NULL',
      );
      return new Map(
        (result.rows as Array<{ id: string; deadline: unknown }>).map((row) => [
          row.id,
          row.deadline instanceof Date
            ? row.deadline.toISOString()
            : String(row.deadline),
        ]),
      );
    } catch (error) {
      this.logger.warn(
        `Không đọc được deadline đơn hàng cho task inbox: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return new Map();
    }
  }

  private async driverOrderIds(username: string): Promise<Set<string>> {
    if (!this.db) {
      return new Set();
    }
    try {
      const result = await this.db.query(
        `SELECT DISTINCT s.order_id
           FROM shipments s
           JOIN drivers d ON d.id = s.driver_id
          WHERE d.username = $1`,
        [username],
      );
      return new Set(
        (result.rows as Array<{ order_id: string }>).map((row) => row.order_id),
      );
    } catch (error) {
      this.logger.warn(
        `Không đọc được đơn của tài xế ${username}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return new Set();
    }
  }
}
