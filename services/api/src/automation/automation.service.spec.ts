// SPDX-License-Identifier: Apache-2.0
import { AutomationService } from './automation.service';
import type { ArchiveService } from '../archive/archive.service';
import type { DbService } from '../db/db.service';
import type { NotificationsService } from '../notifications/notification.service';
import type { NewNotification } from '../notifications/notification.types';
import type { OutboxService } from '../outbox/outbox.service';
import type { WorkflowService } from '../workflow/workflow.service';

function makeDb(handlers: {
  runs?: Array<Record<string, unknown>>;
  workflowRows?: Array<Record<string, unknown>>;
}) {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO automation_runs')) {
        return {
          rows: [
            {
              id: 1,
              job_name: params?.[0],
              trigger: params?.[1],
              status: params?.[2],
              started_at: params?.[3],
              finished_at: params?.[4],
              duration_ms: params?.[5],
              summary: params?.[6],
              error: params?.[7],
            },
          ],
        };
      }
      if (sql.includes('FROM workflow_instances')) {
        return { rows: handlers.workflowRows ?? [] };
      }
      if (sql.includes('COUNT(*)') && sql.includes('automation_runs')) {
        return { rows: [{ count: handlers.runs?.length ?? 0 }] };
      }
      if (sql.includes('FROM automation_runs')) {
        const limit = Number(params?.[0] ?? 50);
        const offset = Number(params?.[1] ?? 0);
        return {
          rows: (handlers.runs ?? []).slice(offset, offset + limit),
        };
      }
      return { rows: [] };
    }),
  } as unknown as DbService;
}

function makeNotifications() {
  let nextId = 1;
  const created: NewNotification[] = [];
  return {
    created,
    service: {
      create: jest.fn(async (input: NewNotification) => {
        created.push(input);
        return {
          id: nextId++,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          actionHref: input.actionHref ?? null,
          audienceRole: input.audienceRole ?? null,
          audienceUser: input.audienceUser ?? null,
          readAt: null,
          createdAt: new Date().toISOString(),
        };
      }),
      listAll: jest.fn(async () => []),
    } as unknown as NotificationsService,
  };
}

function makeWorkflow(
  transitions: Array<{ from: string; to: string; role: string; guard: string }>,
) {
  return {
    getTransitions: jest.fn(() => transitions),
  } as unknown as WorkflowService;
}

describe('AutomationService', () => {
  it('outbox-relay gọi relay và ghi run log success', async () => {
    const db = makeDb({});
    const outbox = {
      relay: jest.fn(async () => ({
        processed: 3,
        failed: 0,
        retried: 1,
        eventIds: [1, 2, 3],
      })),
    } as unknown as OutboxService;
    const notifications = makeNotifications();
    const service = new AutomationService(
      db,
      outbox,
      notifications.service,
      makeWorkflow([]),
    );

    const run = await service.run('outbox-relay', 'manual');

    expect(outbox.relay).toHaveBeenCalledWith(100);
    expect(run).toMatchObject({
      jobName: 'outbox-relay',
      trigger: 'manual',
      status: 'success',
    });
    expect(run.summary).toMatchObject({ processed: 3, retried: 1 });
  });

  it('sla-scan tạo notification đúng vai và escalation sau 60 phút', async () => {
    const db = makeDb({
      workflowRows: [
        {
          id: 'WF-1',
          definition_id: 'order-flow',
          definition_version: '2',
          business_key: 'DH-1001',
          current_state: 'Chờ kho',
          deadline: '2026-11-27T08:00:00.000Z',
          overdue_minutes: 90,
        },
        {
          id: 'WF-2',
          definition_id: 'order-flow',
          definition_version: '2',
          business_key: 'DH-1002',
          current_state: 'Chờ điều phối',
          deadline: '2026-11-27T09:30:00.000Z',
          overdue_minutes: 10,
        },
      ],
    });
    const notifications = makeNotifications();
    const workflow = makeWorkflow([
      { from: 'Chờ kho', to: 'Đang đóng gói', role: 'Nhân viên kho', guard: 'tồn kho đủ' },
      { from: 'Chờ điều phối', to: 'Chờ kho', role: 'Điều phối viên', guard: '' },
    ]);
    const service = new AutomationService(
      db,
      { relay: jest.fn() } as unknown as OutboxService,
      notifications.service,
      workflow,
    );

    const run = await service.run('sla-scan', 'schedule');

    expect(run.status).toBe('success');
    expect(run.summary).toEqual({
      scanned: 2,
      overdueNotifications: 2,
      escalated: 1,
      notificationsCreated: 3,
    });
    expect(notifications.created).toHaveLength(3);
    expect(notifications.created[0]).toMatchObject({
      type: 'sla.overdue',
      audienceRole: 'Nhân viên kho',
      dedupKey: 'sla:WF-1:Chờ kho:Nhân viên kho',
    });
    expect(notifications.created[1]).toMatchObject({
      type: 'sla.escalation',
      audienceRole: 'Quản lý',
      dedupKey: 'sla-escalated:WF-1:Chờ kho',
    });
    expect(notifications.created[2]).toMatchObject({
      type: 'sla.overdue',
      audienceRole: 'Điều phối viên',
    });
  });

  it('không escalation trùng khi vai xử lý đã là quản lý', async () => {
    const db = makeDb({
      workflowRows: [
        {
          id: 'WF-3',
          definition_id: 'order-flow',
          definition_version: '2',
          business_key: 'DH-1003',
          current_state: 'Chờ duyệt',
          deadline: '2026-11-27T08:00:00.000Z',
          overdue_minutes: 120,
        },
      ],
    });
    const notifications = makeNotifications();
    const service = new AutomationService(
      db,
      { relay: jest.fn() } as unknown as OutboxService,
      notifications.service,
      makeWorkflow([
        { from: 'Chờ duyệt', to: 'Đã duyệt', role: 'Quản lý', guard: '' },
      ]),
    );

    const run = await service.run('sla-scan', 'manual');

    expect(run.summary).toMatchObject({
      overdueNotifications: 1,
      escalated: 0,
      notificationsCreated: 1,
    });
    expect(notifications.created).toHaveLength(1);
  });

  it('từ chối job lạ và chặn chạy chồng', async () => {
    const service = new AutomationService(
      makeDb({}),
      { relay: jest.fn() } as unknown as OutboxService,
      makeNotifications().service,
      makeWorkflow([]),
    );

    await expect(
      service.run('unknown' as never, 'manual'),
    ).rejects.toThrow('Job không hợp lệ');
  });

  it('lakehouse-archive gọi ArchiveService với retention/limit và log summary', async () => {
    const archive = {
      run: jest.fn(async () => ({
        archived: 2,
        run: {
          id: 'AR-1001',
          dataset: 'orders',
          cutoffAt: '2026-11-01T00:00:00.000Z',
          objectKey:
            'warehouse/tenants/default/orders/cutoff=2026-11-01/run=AR-1001.parquet',
          rowCount: 2,
          bytes: 1024,
          status: 'completed',
          error: null,
          startedAt: '2026-11-28T00:00:00.000Z',
          finishedAt: '2026-11-28T00:00:01.000Z',
          createdAt: '2026-11-28T00:00:00.000Z',
        },
      })),
    } as unknown as ArchiveService;
    const service = new AutomationService(
      makeDb({}),
      { relay: jest.fn() } as unknown as OutboxService,
      makeNotifications().service,
      makeWorkflow([]),
      archive,
    );

    const run = await service.run('lakehouse-archive', 'manual');

    expect(archive.run).toHaveBeenCalledWith(
      { olderThanDays: 0, limit: 500 },
      expect.objectContaining({ username: 'system', userId: 'system' }),
    );
    expect(run.summary).toMatchObject({
      archived: 2,
      runId: 'AR-1001',
      rows: 2,
      bytes: 1024,
    });
  });

  it('listRunsPage trả items/total/limit/offset và chặn offset âm', async () => {
    const db = makeDb({
      runs: [
        { id: 3, job_name: 'sla-scan' },
        { id: 2, job_name: 'outbox-relay' },
        { id: 1, job_name: 'outbox-relay' },
      ],
    });
    const service = new AutomationService(
      db,
      { relay: jest.fn() } as unknown as OutboxService,
      makeNotifications().service,
      makeWorkflow([]),
    );

    const page = await service.listRunsPage(2, 1);

    expect(page).toMatchObject({ total: 3, limit: 2, offset: 1 });
    expect(page.items.map((run) => run.id)).toEqual([2, 1]);
    await expect(service.listRunsPage(10, -1)).rejects.toThrow('offset');
  });

  it('status trả lastRun theo từng job', async () => {
    const db = makeDb({
      runs: [
        {
          id: 2,
          job_name: 'sla-scan',
          trigger: 'schedule',
          status: 'success',
          started_at: '2026-11-27T10:00:00.000Z',
          finished_at: '2026-11-27T10:00:01.000Z',
          duration_ms: 1000,
          summary: '{"scanned":1}',
          error: null,
        },
        {
          id: 1,
          job_name: 'outbox-relay',
          trigger: 'schedule',
          status: 'success',
          started_at: '2026-11-27T09:59:00.000Z',
          finished_at: '2026-11-27T09:59:00.100Z',
          duration_ms: 100,
          summary: {},
          error: null,
        },
      ],
    });
    const service = new AutomationService(
      db,
      { relay: jest.fn() } as unknown as OutboxService,
      makeNotifications().service,
      makeWorkflow([]),
    );

    const status = await service.status();

    expect(status.jobs).toHaveLength(3);
    expect(status.jobs.find((job) => job.name === 'sla-scan')?.lastRun?.id).toBe(2);
    expect(
      status.jobs.find((job) => job.name === 'outbox-relay')?.lastRun?.id,
    ).toBe(1);
    expect(status.enabled).toBe(false);
  });
});
