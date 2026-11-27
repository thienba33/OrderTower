// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ParquetReader,
  ParquetSchema,
  ParquetWriter,
} from 'parquetjs-lite';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { IdSequenceService } from '../db/id-sequence';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/orders.types';
import type { ObjectStorage } from '../storage/storage.types';
import { OBJECT_STORAGE } from '../storage/object-storage';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ARCHIVE_STORE } from './archive.store';
import type {
  ArchiveInput,
  ArchiveStore,
  ArchiveRun,
  ArchiveRunResult,
  ArchiveSummary,
  ColdAnalytics,
  ColdGroup,
  ColdOrderRow,
} from './archive.types';

const CLOSED_STATES: ReadonlySet<string> = new Set([
  'Đã giao',
  'Hoàn',
  'Hủy',
]);
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const DEFAULT_SAMPLE = 20;
const MAX_SAMPLE = 100;
const PARQUET_CONTENT_TYPE = 'application/vnd.apache.parquet';

function parseNonNegativeInt(
  value: unknown,
  field: string,
  fallback: number,
  max: number,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) {
    throw new BadRequestException(
      `${field} phải là số nguyên trong khoảng 0..${max}.`,
    );
  }
  return number;
}

function parsePositiveInt(
  value: unknown,
  field: string,
  fallback: number,
  max: number,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new BadRequestException(
      `${field} phải là số nguyên trong khoảng 1..${max}.`,
    );
  }
  return number;
}

function parseDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    throw new BadRequestException(`${field} phải có dạng YYYY-MM-DD.`);
  }
  return value;
}

function safeTenant(tenantId: string): string {
  return tenantId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'default';
}

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  constructor(
    private readonly orders: OrdersService,
    @Inject(ARCHIVE_STORE)
    private readonly store: ArchiveStore,
    private readonly ids: IdSequenceService,
    private readonly tenant: TenantContextService,
    @Inject(OBJECT_STORAGE)
    private readonly objects: ObjectStorage,
    private readonly audit: AuditService,
  ) {}

  async run(input: ArchiveInput, caller: Caller): Promise<ArchiveRunResult> {
    const olderThanDays = parseNonNegativeInt(
      input.olderThanDays,
      'olderThanDays',
      0,
      3650,
    );
    const limit = parsePositiveInt(input.limit, 'limit', DEFAULT_LIMIT, MAX_LIMIT);
    const startedAt = new Date().toISOString();
    const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const cutoffAt = new Date(cutoffMs).toISOString();
    const tenantId = this.tenant.getTenantId();

    const [orders, archived] = await Promise.all([
      this.orders.list(),
      this.store.listArchivedOrderIds(),
    ]);
    const candidates = orders
      .filter((order) => CLOSED_STATES.has(order.state))
      .filter((order) => {
        const updated = Date.parse(order.updatedAt);
        return Number.isFinite(updated) && updated <= cutoffMs;
      })
      .filter((order) => !archived.has(order.id))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, limit);

    if (candidates.length === 0) {
      return { run: null, archived: 0 };
    }

    const sequence = await this.ids.next('archive_run', 1001);
    const runId = `AR-${String(sequence).padStart(4, '0')}`;
    const objectKey = `warehouse/tenants/${safeTenant(tenantId)}/orders/cutoff=${cutoffAt.slice(0, 10)}/run=${runId}.parquet`;

    try {
      const buffer = await this.writeParquet(candidates, tenantId);
      await this.objects.put(objectKey, buffer, PARQUET_CONTENT_TYPE);
      const finishedAt = new Date().toISOString();
      const run: ArchiveRun = {
        id: runId,
        dataset: 'orders',
        cutoffAt,
        objectKey,
        rowCount: candidates.length,
        bytes: buffer.length,
        status: 'completed',
        error: null,
        startedAt,
        finishedAt,
        createdAt: startedAt,
      };
      await this.store.saveRunWithManifests(
        run,
        candidates.map((order) => order.id),
      );
      try {
        await this.audit.append({
          actor: caller.username,
          role: caller.roles[0] ?? '',
          action: 'archive.orders.completed',
          orderId: 'archive',
          from: null,
          to: null,
          detail: `${runId}: ${run.rowCount} đơn, ${run.bytes} byte, cutoff ${cutoffAt}.`,
        });
      } catch (auditError) {
        this.logger.warn(
          `Không ghi được audit archive ${runId}: ${
            auditError instanceof Error ? auditError.message : String(auditError)
          }`,
        );
      }
      this.logger.log(
        `Archive ${run.rowCount} đơn vào ${objectKey} (${run.bytes} byte).`,
      );
      return { run, archived: run.rowCount };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const failed: ArchiveRun = {
        id: runId,
        dataset: 'orders',
        cutoffAt,
        objectKey: null,
        rowCount: 0,
        bytes: 0,
        status: 'failed',
        error: message,
        startedAt,
        finishedAt: new Date().toISOString(),
        createdAt: startedAt,
      };
      await this.store.saveRun(failed);
      try {
        await this.audit.append({
          actor: caller.username,
          role: caller.roles[0] ?? '',
          action: 'archive.orders.failed',
          orderId: 'archive',
          from: null,
          to: null,
          detail: `${runId}: ${message}`,
        });
      } catch {
        // Lỗi audit không được che lỗi archive gốc.
      }
      throw new ServiceUnavailableException(`Archive thất bại: ${message}`);
    }
  }

  async listRuns(limitInput?: unknown): Promise<ArchiveRun[]> {
    const limit = parsePositiveInt(limitInput, 'limit', 10, 100);
    return this.store.listRuns(limit);
  }

  async summary(): Promise<ArchiveSummary> {
    const [orders, archivedOrders, runCount, lastRun, completed] =
      await Promise.all([
        this.orders.list(),
        this.store.countArchived(),
        this.store.countRuns(),
        this.store.latestRun(),
        this.store.listCompletedRuns(),
      ]);
    return {
      ordersInOltp: orders.length,
      archivedOrders,
      runCount,
      coldBytes: completed.reduce((sum, run) => sum + run.bytes, 0),
      lastRun,
    };
  }

  async analytics(filters: {
    from?: unknown;
    to?: unknown;
    channelId?: unknown;
    limit?: unknown;
  }): Promise<ColdAnalytics> {
    const from = parseDate(filters.from, 'from');
    const to = parseDate(filters.to, 'to');
    if (from && to && from > to) {
      throw new BadRequestException('from không được sau to.');
    }
    const channelId =
      typeof filters.channelId === 'string' &&
      filters.channelId.trim() !== ''
        ? filters.channelId.trim()
        : null;
    const sampleLimit = parsePositiveInt(
      filters.limit,
      'limit',
      DEFAULT_SAMPLE,
      MAX_SAMPLE,
    );

    const runs = await this.store.listCompletedRuns();
    const byState = new Map<string, ColdGroup>();
    const byChannel = new Map<string, ColdGroup>();
    const byDay = new Map<string, ColdGroup>();
    const rows: ColdOrderRow[] = [];
    const seenOrders = new Set<string>();
    let readRuns = 0;

    for (const run of runs) {
      if (!run.objectKey) {
        continue;
      }
      const runRows = await this.readParquet(run.objectKey);
      readRuns++;
      for (const row of runRows) {
        if (from && row.updatedAt.slice(0, 10) < from) {
          continue;
        }
        if (to && row.updatedAt.slice(0, 10) > to) {
          continue;
        }
        if (channelId && row.channelId !== channelId) {
          continue;
        }
        // Phòng trường hợp có 2 run trùng order (retry/concurrent): chỉ tính
        // một lần theo order_id.
        if (seenOrders.has(row.orderId)) {
          continue;
        }
        seenOrders.add(row.orderId);
        rows.push(row);
        addGroup(byState, row.state, row.total);
        addGroup(byChannel, row.channelId || '(không kênh)', row.total);
        addGroup(byDay, row.updatedAt.slice(0, 10), row.total);
      }
    }

    const totalRevenue = rows.reduce((sum, row) => sum + row.total, 0);
    return {
      source: 'parquet',
      runs: readRuns,
      rows: rows.length,
      totalRevenue,
      byState: sortGroups(byState),
      byChannel: sortGroups(byChannel),
      byDay: sortGroupsByKey(byDay),
      sample: [...rows]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, sampleLimit),
    };
  }

  private async writeParquet(
    orders: Order[],
    tenantId: string,
  ): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'ordertower-archive-'));
    const file = join(dir, 'orders.parquet');
    try {
      const schema = new ParquetSchema({
        tenant_id: { type: 'UTF8' },
        order_id: { type: 'UTF8' },
        state: { type: 'UTF8' },
        created_at: { type: 'UTF8' },
        updated_at: { type: 'UTF8' },
        total: { type: 'DOUBLE' },
        channel_id: { type: 'UTF8' },
        customer_id: { type: 'UTF8' },
        item_count: { type: 'INT32' },
        items_json: { type: 'UTF8' },
      });
      const writer = await ParquetWriter.openFile(schema, file);
      for (const order of orders) {
        await writer.appendRow({
          tenant_id: tenantId,
          order_id: order.id,
          state: order.state,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
          total: order.total,
          channel_id: order.channelId ?? '',
          customer_id: order.customerId ?? '',
          item_count: order.items.length,
          items_json: JSON.stringify(order.items),
        });
      }
      await writer.close();
      return await readFile(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async readParquet(objectKey: string): Promise<ColdOrderRow[]> {
    const stored = await this.objects.get(objectKey);
    const dir = await mkdtemp(join(tmpdir(), 'ordertower-cold-'));
    const file = join(dir, 'orders.parquet');
    try {
      await writeFile(file, stored.body);
      const reader = await ParquetReader.openFile(file);
      const cursor = reader.getCursor();
      const rows: ColdOrderRow[] = [];
      try {
        let record: Record<string, unknown> | null;
        while ((record = await cursor.next()) !== null) {
          rows.push({
            tenantId: String(record.tenant_id ?? ''),
            orderId: String(record.order_id ?? ''),
            state: String(record.state ?? ''),
            createdAt: String(record.created_at ?? ''),
            updatedAt: String(record.updated_at ?? ''),
            total: Number(record.total ?? 0),
            channelId: String(record.channel_id ?? ''),
            customerId: String(record.customer_id ?? ''),
            itemCount: Number(record.item_count ?? 0),
            itemsJson: String(record.items_json ?? '[]'),
          });
        }
      } finally {
        await reader.close();
      }
      return rows;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

function addGroup(
  map: Map<string, ColdGroup>,
  key: string,
  revenue: number,
): void {
  const current = map.get(key) ?? { key, count: 0, revenue: 0 };
  current.count += 1;
  current.revenue += revenue;
  map.set(key, current);
}

function sortGroups(map: Map<string, ColdGroup>): ColdGroup[] {
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );
}

function sortGroupsByKey(map: Map<string, ColdGroup>): ColdGroup[] {
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}
