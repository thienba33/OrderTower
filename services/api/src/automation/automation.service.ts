// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ArchiveService } from '../archive/archive.service';
import type { Caller } from '../auth/auth.types';
import { BUSINESS_ROLE } from '../auth/permissions';
import { DbService } from '../db/db.service';
import { NotificationsService } from '../notifications/notification.service';
import { OutboxService } from '../outbox/outbox.service';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  AutomationJobName,
  AutomationJobStatus,
  AutomationRun,
  AutomationRunPage,
  AutomationRunStatus,
  AutomationStatus,
  AutomationTrigger,
} from './automation.types';

const JOB_NAMES: readonly AutomationJobName[] = [
  'outbox-relay',
  'sla-scan',
  'lakehouse-archive',
];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const ESCALATION_MINUTES = 60;
const SLA_SCAN_LIMIT = 200;

const SYSTEM_CALLER: Caller = {
  userId: 'system',
  username: 'system',
  roles: [BUSINESS_ROLE.ADMIN],
};

function readInterval(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (
    !Number.isInteger(value) ||
    value < 5000 ||
    value > 86_400_000
  ) {
    return fallback;
  }
  return value;
}

function readBoundedInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseSummary(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (value ?? {}) as Record<string, unknown>;
}

function formatOverdue(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} phút`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours} giờ`;
  }
  const days = Math.floor(hours / 24);
  const remain = hours % 24;
  return remain === 0 ? `${days} ngày` : `${days} ngày ${remain} giờ`;
}

function formatDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function mapRun(row: Record<string, unknown>): AutomationRun {
  return {
    id: Number(row.id),
    jobName: row.job_name as AutomationJobName,
    trigger: row.trigger as AutomationTrigger,
    status: row.status as AutomationRunStatus,
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    durationMs: Number(row.duration_ms),
    summary: parseSummary(row.summary),
    error: (row.error as string | null) ?? null,
  };
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private readonly inFlight = new Set<AutomationJobName>();

  constructor(
    private readonly db: DbService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
    private readonly workflow: WorkflowService,
    @Optional()
    private readonly archive?: ArchiveService,
  ) {}

  get enabled(): boolean {
    return (
      process.env.AUTOMATION_ENABLED !== '0' && process.env.NODE_ENV !== 'test'
    );
  }

  get outboxIntervalMs(): number {
    return readInterval('AUTOMATION_OUTBOX_INTERVAL_MS', 15_000);
  }

  get slaIntervalMs(): number {
    return readInterval('AUTOMATION_SLA_INTERVAL_MS', 60_000);
  }

  get archiveIntervalMs(): number {
    return readInterval('AUTOMATION_ARCHIVE_INTERVAL_MS', 86_400_000);
  }

  get archiveRetentionDays(): number {
    return readBoundedInt('ARCHIVE_RETENTION_DAYS', 0, 0, 3650);
  }

  get archiveLimit(): number {
    return readBoundedInt('ARCHIVE_LIMIT', 500, 1, 1000);
  }

  async status(): Promise<AutomationStatus> {
    const runs = await this.listRuns(20);
    const lastByJob = new Map<AutomationJobName, AutomationRun>();
    for (const run of runs) {
      if (!lastByJob.has(run.jobName)) {
        lastByJob.set(run.jobName, run);
      }
    }
    const jobs: AutomationJobStatus[] = [
      {
        name: 'outbox-relay',
        intervalMs: this.outboxIntervalMs,
        lastRun: lastByJob.get('outbox-relay') ?? null,
      },
      {
        name: 'sla-scan',
        intervalMs: this.slaIntervalMs,
        lastRun: lastByJob.get('sla-scan') ?? null,
      },
      {
        name: 'lakehouse-archive',
        intervalMs: this.archiveIntervalMs,
        lastRun: lastByJob.get('lakehouse-archive') ?? null,
      },
    ];
    return { enabled: this.enabled, jobs };
  }

  async listRuns(limit = DEFAULT_LIMIT): Promise<AutomationRun[]> {
    return (await this.listRunsPage(limit, 0)).items;
  }

  async listRunsPage(
    limit = DEFAULT_LIMIT,
    offset = 0,
  ): Promise<AutomationRunPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`,
      );
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new BadRequestException('offset phải là số nguyên không âm.');
    }
    const [countResult, rows] = await Promise.all([
      this.db.query('SELECT COUNT(*)::int AS count FROM automation_runs'),
      this.db.query(
        `SELECT id, job_name, trigger, status, started_at, finished_at,
                duration_ms, summary, error
           FROM automation_runs
          ORDER BY started_at DESC, id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
    ]);
    return {
      items: (rows.rows as Array<Record<string, unknown>>).map(mapRun),
      total: Number(
        (countResult.rows[0] as { count?: number } | undefined)?.count ?? 0,
      ),
      limit,
      offset,
    };
  }

  async run(
    jobName: AutomationJobName,
    trigger: AutomationTrigger,
  ): Promise<AutomationRun> {
    if (!JOB_NAMES.includes(jobName)) {
      throw new BadRequestException(
        `Job không hợp lệ. Chỉ hỗ trợ: ${JOB_NAMES.join(', ')}.`,
      );
    }
    if (this.inFlight.has(jobName)) {
      throw new ConflictException(`Job ${jobName} đang chạy.`);
    }
    this.inFlight.add(jobName);

    const startedAt = new Date();
    let status: AutomationRunStatus = 'success';
    let summary: Record<string, unknown> = {};
    let error: string | null = null;
    try {
      if (jobName === 'outbox-relay') {
        summary = await this.runOutboxRelay();
      } else if (jobName === 'sla-scan') {
        summary = await this.runSlaScan();
      } else {
        summary = await this.runArchive();
      }
    } catch (caught) {
      status = 'failed';
      error = caught instanceof Error ? caught.message : String(caught);
      this.logger.error(`Job ${jobName} lỗi: ${error}`);
    } finally {
      this.inFlight.delete(jobName);
    }

    const finishedAt = new Date();
    const result = await this.db.query(
      `INSERT INTO automation_runs
         (job_name, trigger, status, started_at, finished_at,
          duration_ms, summary, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, job_name, trigger, status, started_at, finished_at,
                 duration_ms, summary, error`,
      [
        jobName,
        trigger,
        status,
        startedAt.toISOString(),
        finishedAt.toISOString(),
        finishedAt.getTime() - startedAt.getTime(),
        JSON.stringify(summary),
        error,
      ],
    );
    return mapRun(result.rows[0] as Record<string, unknown>);
  }

  private async runOutboxRelay(): Promise<Record<string, unknown>> {
    const result = await this.outbox.relay(100);
    return {
      processed: result.processed,
      retried: result.retried,
      failed: result.failed,
      eventIds: result.eventIds,
    };
  }

  private async runSlaScan(): Promise<Record<string, unknown>> {
    const result = await this.db.query(
      `SELECT wi.id, wi.definition_id, wi.definition_version,
              wi.business_key, wi.current_state, o.deadline,
              GREATEST(
                0,
                EXTRACT(EPOCH FROM (now() - o.deadline)) / 60
              )::int AS overdue_minutes
         FROM workflow_instances wi
         JOIN orders o ON o.id = wi.business_key
        WHERE wi.status = 'active'
          AND o.deadline IS NOT NULL
          AND o.deadline <= now()
        ORDER BY o.deadline, wi.id
        LIMIT ${SLA_SCAN_LIMIT}`,
    );

    let overdueCreated = 0;
    let escalated = 0;
    const rows = result.rows as Array<Record<string, unknown>>;
    for (const row of rows) {
      const instanceId = String(row.id);
      const businessKey = String(row.business_key);
      const currentState = String(row.current_state);
      const overdueMinutes = Number(row.overdue_minutes ?? 0);
      const roles = [
        ...new Set(
          this.workflow
            .getTransitions(
              String(row.definition_id),
              String(row.definition_version),
            )
            .filter((transition) => transition.from === currentState)
            .map((transition) => transition.role)
            .filter((role) => role.trim() !== ''),
        ),
      ];
      if (roles.length === 0) {
        continue;
      }
      const deadline = formatDeadline(toIso(row.deadline));
      const overdueText = formatOverdue(overdueMinutes);
      for (const role of roles) {
        const notification = await this.notifications.create({
          type: 'sla.overdue',
          title: `Task quá hạn: đơn ${businessKey}`,
          body: `Đơn ${businessKey} ở trạng thái "${currentState}" đã quá hạn ${overdueText} (hạn ${deadline}). Vai ${role} cần xử lý.`,
          entityType: 'order',
          entityId: businessKey,
          actionHref: `/orders/${encodeURIComponent(businessKey)}`,
          audienceRole: role,
          dedupKey: `sla:${instanceId}:${currentState}:${role}`,
        });
        if (notification) {
          overdueCreated += 1;
        }
      }

      if (
        overdueMinutes >= ESCALATION_MINUTES &&
        !roles.includes(BUSINESS_ROLE.MANAGER)
      ) {
        const escalation = await this.notifications.create({
          type: 'sla.escalation',
          title: `Escalation SLA: đơn ${businessKey}`,
          body: `Đơn ${businessKey} đã quá hạn ${overdueText}, trạng thái "${currentState}". Quản lý cần can thiệp hoặc điều phối lại.`,
          entityType: 'order',
          entityId: businessKey,
          actionHref: `/orders/${encodeURIComponent(businessKey)}`,
          audienceRole: BUSINESS_ROLE.MANAGER,
          dedupKey: `sla-escalated:${instanceId}:${currentState}`,
        });
        if (escalation) {
          escalated += 1;
        }
      }
    }

    return {
      scanned: rows.length,
      overdueNotifications: overdueCreated,
      escalated,
      notificationsCreated: overdueCreated + escalated,
    };
  }

  private async runArchive(): Promise<Record<string, unknown>> {
    if (!this.archive) {
      throw new ServiceUnavailableException(
        'ArchiveService chưa sẵn sàng cho job lakehouse-archive.',
      );
    }
    const result = await this.archive.run(
      {
        olderThanDays: this.archiveRetentionDays,
        limit: this.archiveLimit,
      },
      SYSTEM_CALLER,
    );
    return {
      archived: result.archived,
      runId: result.run?.id ?? null,
      rows: result.run?.rowCount ?? 0,
      bytes: result.run?.bytes ?? 0,
      cutoffAt: result.run?.cutoffAt ?? null,
      objectKey: result.run?.objectKey ?? null,
    };
  }
}
