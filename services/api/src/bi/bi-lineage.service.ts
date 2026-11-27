// SPDX-License-Identifier: Apache-2.0
import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DbService } from '../db/db.service';
import { OrdersService } from '../orders/orders.service';
import { BI_STORE } from './bi.store';
import type { BiStore, DxRatio, DxScoreSnapshot } from './bi.types';
import type {
  BiLineage,
  LineageArchiveRef,
  LineageAuditRef,
  LineageAxis,
  LineageFeedbackRef,
  LineageOrderRef,
  LineageRatio,
  LineageRecommendationRef,
} from './bi-lineage.types';

const CLOSED_STATES: ReadonlySet<string> = new Set([
  'Đã giao',
  'Hoàn',
  'Hủy',
]);
const ORDER_LIMIT = 50;
const AUDIT_LIMIT = 50;
const RECOMMENDATION_LIMIT = 30;
const FEEDBACK_LIMIT = 30;
const ARCHIVE_LIMIT = 50;

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function ratioRef(
  key: string,
  label: string,
  ratio: DxRatio,
): LineageRatio {
  return {
    key,
    label,
    value: ratio.value,
    n: ratio.n,
    measured: ratio.measured,
    note: ratio.note,
  };
}

@Injectable()
export class BiLineageService {
  constructor(
    @Inject(BI_STORE) private readonly store: BiStore,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly db: DbService,
  ) {}

  async latest(): Promise<BiLineage> {
    const snapshot = await this.store.latestSnapshot();
    if (!snapshot) {
      throw new NotFoundException('Chưa có snapshot DX-Score để dựng phả hệ.');
    }
    return this.build(snapshot);
  }

  async byId(snapshotId: string): Promise<BiLineage> {
    const snapshots = await this.store.listSnapshots();
    const snapshot = snapshots.find((item) => item.id === snapshotId);
    if (!snapshot) {
      throw new NotFoundException(`Không tìm thấy snapshot ${snapshotId}.`);
    }
    return this.build(snapshot);
  }

  private async build(snapshot: DxScoreSnapshot): Promise<BiLineage> {
    const referenceEnd = snapshot.referenceDate
      ? `${snapshot.referenceDate}T23:59:59.999Z`
      : snapshot.computedAt;

    const [recommendations, feedback, orders, audit, manifests, runs] =
      await Promise.all([
        this.store.listRecommendations(),
        this.store.listFeedback(),
        this.orders.list(),
        this.audit.getAll(),
        this.db.query(
          `SELECT order_id, archive_key, archived_at
             FROM order_archive_manifest
            ORDER BY archived_at DESC
            LIMIT $1`,
          [ARCHIVE_LIMIT],
        ),
        this.db.query(
          `SELECT id, object_key, row_count, started_at
             FROM archive_runs
            WHERE status = 'completed'
            ORDER BY started_at DESC
            LIMIT $1`,
          [ARCHIVE_LIMIT],
        ),
      ]);

    const runByKey = new Map<
      string,
      { id: string; row_count: unknown }
    >();
    for (const row of runs.rows as Array<Record<string, unknown>>) {
      runByKey.set(row.object_key as string, {
        id: row.id as string,
        row_count: row.row_count,
      });
    }

    const archive: LineageArchiveRef[] = (
      manifests.rows as Array<Record<string, unknown>>
    ).map((row) => {
      const run = runByKey.get(row.archive_key as string);
      return {
        orderId: row.order_id as string,
        archiveKey: row.archive_key as string,
        archivedAt: toIso(row.archived_at),
        runId: run?.id ?? null,
        rowCount: Number(run?.row_count ?? 0),
      };
    });

    const orderRefs: LineageOrderRef[] = orders
      .filter((order) => CLOSED_STATES.has(order.state))
      .filter((order) => order.updatedAt <= referenceEnd)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, ORDER_LIMIT)
      .map((order) => ({
        id: order.id,
        state: order.state,
        updatedAt: order.updatedAt,
      }));

    const auditRefs: LineageAuditRef[] = audit
      .filter((record) => isRelevantAudit(record.action))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, AUDIT_LIMIT)
      .map((record) => ({
        seq: record.seq,
        action: record.action,
        orderId: record.orderId,
        at: record.at,
      }));

    const recommendationRefs: LineageRecommendationRef[] = recommendations
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, RECOMMENDATION_LIMIT)
      .map((rec) => ({
        id: rec.id,
        anomalyKey: rec.anomalyKey,
        type: rec.type,
        sku: rec.sku,
        channelId: rec.channelId,
        status: rec.status,
        createdAt: rec.createdAt,
        inputs: rec.inputs,
      }));

    const feedbackRefs: LineageFeedbackRef[] = feedback
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, FEEDBACK_LIMIT)
      .map((item) => ({
        id: item.id,
        recommendationId: item.recommendationId,
        correct: item.correct,
        recordedAt: item.recordedAt,
      }));

    const axes: LineageAxis[] = [
      {
        axis: 'P',
        score: snapshot.p.score,
        maxScore: 30,
        ratios: [
          ratioRef(
            'closedWithoutDetour',
            'Đơn đóng không đi đường vòng',
            snapshot.p.closedWithoutDetour,
          ),
          ratioRef(
            'illegalBlocked',
            'Chuyển trạng thái trái phép bị chặn',
            snapshot.p.illegalBlocked,
          ),
        ],
      },
      {
        axis: 'D',
        score: snapshot.d.score,
        maxScore: 30,
        ratios: [
          ratioRef(
            'attributedIndicators',
            'Chỉ số BI có nguồn',
            snapshot.d.attributedIndicators,
          ),
          ratioRef(
            'fullLineage',
            'Đơn có phả hệ đầy đủ',
            snapshot.d.fullLineage,
          ),
        ],
      },
      {
        axis: 'I',
        score: snapshot.i.score,
        maxScore: 30,
        ratios: [
          ratioRef(
            'correctApproved',
            'Đề xuất được duyệt và xác minh đúng',
            snapshot.i.correctApproved,
          ),
        ],
      },
      {
        axis: 'H',
        score: snapshot.h.score,
        maxScore: 100,
        ratios: [
          ratioRef(
            'manualStepRatio',
            'Tỷ lệ bước thủ công',
            snapshot.h.manualStepRatio,
          ),
          ratioRef(
            'exceptionRatio',
            'Tỷ lệ ngoại lệ',
            snapshot.h.exceptionRatio,
          ),
        ],
      },
    ];

    return {
      snapshot: {
        id: snapshot.id,
        formulaVersion: snapshot.formulaVersion,
        referenceDate: snapshot.referenceDate,
        computedAt: snapshot.computedAt,
        total: snapshot.total,
      },
      axes,
      sources: {
        recommendations: recommendationRefs,
        feedback: feedbackRefs,
        orders: orderRefs,
        audit: auditRefs,
        archive,
      },
      coverage: axes.map((axis) => ({
        axis: axis.axis,
        measured: axis.ratios.filter((ratio) => ratio.measured).length,
        total: axis.ratios.length,
      })),
    };
  }
}

function isRelevantAudit(action: string): boolean {
  return (
    action.includes('denied') ||
    action.startsWith('approval.') ||
    action.startsWith('workflow.') ||
    action.startsWith('archive.')
  );
}
