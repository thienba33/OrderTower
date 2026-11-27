// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Queryable, Transactional } from '../db/db.types';
import type {
  ArchiveRun,
  ArchiveRunStatus,
  ArchiveStore,
} from './archive.types';

export const ARCHIVE_STORE = 'ARCHIVE_STORE';

function copyRun(run: ArchiveRun): ArchiveRun {
  return JSON.parse(JSON.stringify(run)) as ArchiveRun;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRunRow(row: Record<string, unknown>): ArchiveRun {
  return {
    id: row.id as string,
    dataset: row.dataset as string,
    cutoffAt: toIso(row.cutoff_at),
    objectKey: (row.object_key as string | null) ?? null,
    rowCount: Number(row.row_count),
    bytes: Number(row.bytes),
    status: row.status as ArchiveRunStatus,
    error: (row.error as string | null) ?? null,
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at ?? row.started_at),
    createdAt: toIso(row.created_at),
  };
}

const RUN_COLUMNS = `id, dataset, cutoff_at, object_key, row_count, bytes,
  status, error, started_at, finished_at, created_at`;

// Kho trong bo nho cho unit test.
@Injectable()
export class InMemoryArchiveStore implements ArchiveStore {
  private readonly runs: ArchiveRun[] = [];
  private readonly manifests = new Map<string, string>();

  async saveRun(run: ArchiveRun): Promise<void> {
    const index = this.runs.findIndex((item) => item.id === run.id);
    if (index >= 0) {
      this.runs[index] = copyRun(run);
    } else {
      this.runs.push(copyRun(run));
    }
  }

  async saveRunWithManifests(
    run: ArchiveRun,
    orderIds: string[],
  ): Promise<void> {
    await this.saveRun(run);
    for (const orderId of orderIds) {
      this.manifests.set(orderId, run.objectKey ?? '');
    }
  }

  async listRuns(limit: number): Promise<ArchiveRun[]> {
    return [...this.runs]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map(copyRun);
  }

  async latestRun(): Promise<ArchiveRun | null> {
    const runs = await this.listRuns(1);
    return runs[0] ?? null;
  }

  async countRuns(): Promise<number> {
    return this.runs.length;
  }

  async listArchivedOrderIds(): Promise<Set<string>> {
    return new Set(this.manifests.keys());
  }

  async countArchived(): Promise<number> {
    return this.manifests.size;
  }

  async listCompletedRuns(): Promise<ArchiveRun[]> {
    return [...this.runs]
      .filter((run) => run.status === 'completed')
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(copyRun);
  }
}

// Kho Postgres: run + manifest duoc ghi trong cung transaction.
export class PostgresArchiveStore implements ArchiveStore {
  constructor(private readonly db: Transactional) {}

  async saveRun(run: ArchiveRun): Promise<void> {
    await this.db.query(
      `INSERT INTO archive_runs
         (id, dataset, cutoff_at, object_key, row_count, bytes, status, error,
          started_at, finished_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         dataset = EXCLUDED.dataset,
         cutoff_at = EXCLUDED.cutoff_at,
         object_key = EXCLUDED.object_key,
         row_count = EXCLUDED.row_count,
         bytes = EXCLUDED.bytes,
         status = EXCLUDED.status,
         error = EXCLUDED.error,
         started_at = EXCLUDED.started_at,
         finished_at = EXCLUDED.finished_at,
         created_at = EXCLUDED.created_at`,
      [
        run.id,
        run.dataset,
        run.cutoffAt,
        run.objectKey,
        run.rowCount,
        run.bytes,
        run.status,
        run.error,
        run.startedAt,
        run.finishedAt,
        run.createdAt,
      ],
    );
  }

  async saveRunWithManifests(
    run: ArchiveRun,
    orderIds: string[],
  ): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await this.saveRunOn(client, run);
      for (const orderId of orderIds) {
        await client.query(
          `INSERT INTO order_archive_manifest
             (order_id, archive_key, archived_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (order_id) DO UPDATE SET
             archive_key = EXCLUDED.archive_key,
             archived_at = EXCLUDED.archived_at`,
          [orderId, run.objectKey ?? '', run.finishedAt],
        );
      }
    });
  }

  async listRuns(limit: number): Promise<ArchiveRun[]> {
    const found = await this.db.query(
      `SELECT ${RUN_COLUMNS}
         FROM archive_runs
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit],
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapRunRow);
  }

  async latestRun(): Promise<ArchiveRun | null> {
    const runs = await this.listRuns(1);
    return runs[0] ?? null;
  }

  async countRuns(): Promise<number> {
    const found = await this.db.query(
      'SELECT count(*)::int AS count FROM archive_runs',
    );
    const row = found.rows[0] as { count: number | string } | undefined;
    return Number(row?.count ?? 0);
  }

  async listArchivedOrderIds(): Promise<Set<string>> {
    const found = await this.db.query(
      'SELECT order_id FROM order_archive_manifest',
    );
    return new Set(
      (found.rows as Array<{ order_id: string }>).map((row) => row.order_id),
    );
  }

  async countArchived(): Promise<number> {
    const found = await this.db.query(
      'SELECT count(*)::int AS count FROM order_archive_manifest',
    );
    const row = found.rows[0] as { count: number | string } | undefined;
    return Number(row?.count ?? 0);
  }

  async listCompletedRuns(): Promise<ArchiveRun[]> {
    const found = await this.db.query(
      `SELECT ${RUN_COLUMNS}
         FROM archive_runs
        WHERE status = 'completed'
        ORDER BY started_at ASC`,
    );
    return (found.rows as Array<Record<string, unknown>>).map(mapRunRow);
  }

  private async saveRunOn(client: Queryable, run: ArchiveRun): Promise<void> {
    await client.query(
      `INSERT INTO archive_runs
         (id, dataset, cutoff_at, object_key, row_count, bytes, status, error,
          started_at, finished_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         dataset = EXCLUDED.dataset,
         cutoff_at = EXCLUDED.cutoff_at,
         object_key = EXCLUDED.object_key,
         row_count = EXCLUDED.row_count,
         bytes = EXCLUDED.bytes,
         status = EXCLUDED.status,
         error = EXCLUDED.error,
         started_at = EXCLUDED.started_at,
         finished_at = EXCLUDED.finished_at,
         created_at = EXCLUDED.created_at`,
      [
        run.id,
        run.dataset,
        run.cutoffAt,
        run.objectKey,
        run.rowCount,
        run.bytes,
        run.status,
        run.error,
        run.startedAt,
        run.finishedAt,
        run.createdAt,
      ],
    );
  }
}
