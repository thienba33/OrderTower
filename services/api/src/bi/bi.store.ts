// SPDX-License-Identifier: Apache-2.0
import { DbService } from '../db/db.service';
import type {
  AIFeedback,
  BiStore,
  DxScoreSnapshot,
  Recommendation,
} from './bi.types';

export const BI_STORE = Symbol('BI_STORE');

// Kho lưu trong bộ nhớ, dùng cho test đơn vị. Đề xuất gắn theo anomalyKey:
// lưu đề xuất đã có quyết định thì không ghi đè (gọi API nhiều lần không
// làm mất quyết định đã duyệt/từ chối).
export class InMemoryBiStore implements BiStore {
  private recommendations = new Map<string, Recommendation>();
  private byKey = new Map<string, Recommendation>();
  private feedback = new Map<string, AIFeedback>();
  private feedbackByRec = new Map<string, AIFeedback>();
  private snapshots: DxScoreSnapshot[] = [];

  async saveRecommendation(rec: Recommendation): Promise<void> {
    const existing = this.byKey.get(rec.anomalyKey);
    if (existing && existing.status !== 'Chờ duyệt') {
      return;
    }
    if (existing) {
      this.recommendations.set(existing.id, rec);
      this.byKey.set(rec.anomalyKey, rec);
      return;
    }
    this.recommendations.set(rec.id, rec);
    this.byKey.set(rec.anomalyKey, rec);
  }

  async findRecommendationById(id: string): Promise<Recommendation | null> {
    return this.recommendations.get(id) ?? null;
  }

  async findRecommendationByKey(
    key: string,
  ): Promise<Recommendation | null> {
    return this.byKey.get(key) ?? null;
  }

  async listRecommendations(): Promise<Recommendation[]> {
    return [...this.recommendations.values()].sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }

  async saveFeedback(item: AIFeedback): Promise<void> {
    this.feedback.set(item.id, item);
    this.feedbackByRec.set(item.recommendationId, item);
  }

  async findFeedbackByRecommendationId(
    recommendationId: string,
  ): Promise<AIFeedback | null> {
    return this.feedbackByRec.get(recommendationId) ?? null;
  }

  async listFeedback(): Promise<AIFeedback[]> {
    return [...this.feedback.values()].sort((a, b) =>
      a.recordedAt.localeCompare(b.recordedAt),
    );
  }

  async saveSnapshot(snapshot: DxScoreSnapshot): Promise<void> {
    this.snapshots.push(snapshot);
  }

  async latestSnapshot(): Promise<DxScoreSnapshot | null> {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;
  }

  async listSnapshots(): Promise<DxScoreSnapshot[]> {
    return [...this.snapshots];
  }
}

// Kho Postgres lưu bền (migration 012): đề xuất, phản hồi, snapshot
// DX-Score. Bản ghi đề xuất có anomaly_key UNIQUE; phản hồi có UNIQUE trên
// recommendation_id. Chỉ lưu bản ghi của lớp BI, không lưu đơn/kho/trả
// hàng của mô-đun khác.
export class PostgresBiStore implements BiStore {
  constructor(private readonly db: DbService) {}

  private toRecommendation(row: Record<string, unknown>): Recommendation {
    return {
      id: row.id as string,
      anomalyKey: row.anomaly_key as string,
      type: row.type as Recommendation['type'],
      sku: row.sku as string | null,
      channelId: row.channel_id as string | null,
      title: row.title as string,
      action: row.action as string,
      reason: row.reason as string,
      inputs: row.inputs as Recommendation['inputs'],
      status: row.status as Recommendation['status'],
      decidedBy: row.decided_by as string | null,
      decidedAt: row.decided_at as string | null,
      decisionReason: row.decision_reason as string | null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private toFeedback(row: Record<string, unknown>): AIFeedback {
    return {
      id: row.id as string,
      recommendationId: row.recommendation_id as string,
      correct: row.correct as boolean,
      note: row.note as string | null,
      recordedBy: row.recorded_by as string,
      recordedAt: (row.recorded_at as Date).toISOString(),
    };
  }

  private toSnapshot(row: Record<string, unknown>): DxScoreSnapshot {
    return row.payload as DxScoreSnapshot;
  }

  async saveRecommendation(rec: Recommendation): Promise<void> {
    await this.db.query(
      `INSERT INTO bi_recommendations
         (id, anomaly_key, type, sku, channel_id, title, action, reason,
          inputs, status, decided_by, decided_at, decision_reason,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (anomaly_key) DO UPDATE SET
         title = EXCLUDED.title,
         action = EXCLUDED.action,
         reason = EXCLUDED.reason,
         inputs = EXCLUDED.inputs,
         status = EXCLUDED.status,
         decided_by = EXCLUDED.decided_by,
         decided_at = EXCLUDED.decided_at,
         decision_reason = EXCLUDED.decision_reason,
         updated_at = EXCLUDED.updated_at
       WHERE bi_recommendations.status = 'Chờ duyệt'`,
      [
        rec.id,
        rec.anomalyKey,
        rec.type,
        rec.sku,
        rec.channelId,
        rec.title,
        rec.action,
        rec.reason,
        JSON.stringify(rec.inputs),
        rec.status,
        rec.decidedBy,
        rec.decidedAt,
        rec.decisionReason,
        rec.createdAt,
        rec.updatedAt,
      ],
    );
  }

  async findRecommendationById(id: string): Promise<Recommendation | null> {
    const found = await this.db.query(
      'SELECT * FROM bi_recommendations WHERE id = $1',
      [id],
    );
    const rows = found.rows as Array<Record<string, unknown>>;
    return rows.length > 0 ? this.toRecommendation(rows[0]) : null;
  }

  async findRecommendationByKey(
    key: string,
  ): Promise<Recommendation | null> {
    const found = await this.db.query(
      'SELECT * FROM bi_recommendations WHERE anomaly_key = $1',
      [key],
    );
    const rows = found.rows as Array<Record<string, unknown>>;
    return rows.length > 0 ? this.toRecommendation(rows[0]) : null;
  }

  async listRecommendations(): Promise<Recommendation[]> {
    const found = await this.db.query(
      'SELECT * FROM bi_recommendations ORDER BY created_at ASC, id ASC',
    );
    return (found.rows as Array<Record<string, unknown>>).map((row) =>
      this.toRecommendation(row),
    );
  }

  async saveFeedback(item: AIFeedback): Promise<void> {
    await this.db.query(
      `INSERT INTO bi_feedback
         (id, recommendation_id, correct, note, recorded_by, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (recommendation_id) DO NOTHING`,
      [
        item.id,
        item.recommendationId,
        item.correct,
        item.note,
        item.recordedBy,
        item.recordedAt,
      ],
    );
  }

  async findFeedbackByRecommendationId(
    recommendationId: string,
  ): Promise<AIFeedback | null> {
    const found = await this.db.query(
      'SELECT * FROM bi_feedback WHERE recommendation_id = $1',
      [recommendationId],
    );
    const rows = found.rows as Array<Record<string, unknown>>;
    return rows.length > 0 ? this.toFeedback(rows[0]) : null;
  }

  async listFeedback(): Promise<AIFeedback[]> {
    const found = await this.db.query(
      'SELECT * FROM bi_feedback ORDER BY recorded_at ASC',
    );
    return (found.rows as Array<Record<string, unknown>>).map((row) =>
      this.toFeedback(row),
    );
  }

  async saveSnapshot(snapshot: DxScoreSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO dx_score_snapshots
         (id, formula_version, reference_date, computed_at,
          p_score, d_score, i_score, h_score, total_score, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        snapshot.id,
        snapshot.formulaVersion,
        snapshot.referenceDate,
        snapshot.computedAt,
        snapshot.p.score,
        snapshot.d.score,
        snapshot.i.score,
        snapshot.h.score,
        snapshot.total,
        JSON.stringify(snapshot),
      ],
    );
  }

  async latestSnapshot(): Promise<DxScoreSnapshot | null> {
    const found = await this.db.query(
      'SELECT * FROM dx_score_snapshots ORDER BY computed_at DESC, id DESC LIMIT 1',
    );
    const rows = found.rows as Array<Record<string, unknown>>;
    return rows.length > 0 ? this.toSnapshot(rows[0]) : null;
  }

  async listSnapshots(): Promise<DxScoreSnapshot[]> {
    const found = await this.db.query(
      'SELECT * FROM dx_score_snapshots ORDER BY computed_at ASC, id ASC',
    );
    return (found.rows as Array<Record<string, unknown>>).map((row) =>
      this.toSnapshot(row),
    );
  }
}
