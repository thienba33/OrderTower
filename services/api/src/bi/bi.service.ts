// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ApprovalService, APPROVER_ROLES } from '../approvals/approval.service';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ReturnsService } from '../returns/return.service';
import {
  computeDxScore,
  computeForecast,
  detectAnomalies,
  recommendationDraftFor,
  referenceDateOf,
} from './bi.compute';
import { BI_STORE } from './bi.store';
import type {
  AIFeedback,
  Anomaly,
  BiStore,
  DecisionRecommendationInput,
  DxScore,
  DxScoreSnapshot,
  ForecastRow,
  Recommendation,
  RecordFeedbackInput,
} from './bi.types';

// Loại lỗi trả về khi người duyệt không có quyền. Dùng 409 (không phải
// 403) theo mẫu restricted-flags: đây là quyết định nghiệp vụ (đề xuất chỉ
// được duyệt bởi Quản lý/Quản trị viên), không phải lỗi phân quyền truy
// cập của hệ thống.
const DECISION_FORBIDDEN = 'Chỉ Quản lý hoặc Quản trị viên mới được quyết định đề xuất.';

@Injectable()
export class BiService implements OnModuleInit {
  private recSeq = 1001;
  private feedbackSeq = 1001;
  private snapshotSeq = 1001;

  constructor(
    @Inject(BI_STORE) private readonly store: BiStore,
    private readonly ordersService: OrdersService,
    private readonly inventoryService: InventoryService,
    private readonly returnsService: ReturnsService,
    private readonly auditService: AuditService,
    private readonly approvalsService: ApprovalService,
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có DX-1001 thì đề xuất mới là DX-1002,
  // không quay về DX-1001 sau khi khởi động lại (giống dãy DH-/TH- của
  // các service khác). Snapshot ghi append-only nên trùng mã là lỗi khóa
  // chính, bắt buộc phải nối số.
  async onModuleInit(): Promise<void> {
    const [recs, feedback, snapshots] = await Promise.all([
      this.store.listRecommendations(),
      this.store.listFeedback(),
      this.store.listSnapshots(),
    ]);
    this.recSeq = computeNextNumber(
      recs.map((rec) => rec.id),
      'DX',
    );
    this.feedbackSeq = computeNextNumber(
      feedback.map((item) => item.id),
      'PH',
    );
    this.snapshotSeq = computeNextNumber(
      snapshots.map((item) => item.id),
      'SN',
    );
  }

  // Ngày dữ liệu mới nhất của bộ dữ liệu (xem bi.compute.ts): ngày tạo đơn
  // mới nhất trừ 8 đơn demo. Null khi chưa có đơn nào.
  async referenceDate(): Promise<string | null> {
    const orders = await this.ordersService.list();
    return referenceDateOf(orders);
  }

  async forecast(): Promise<{ referenceDate: string | null; rows: ForecastRow[] }> {
    const orders = await this.ordersService.list();
    const inventory = await this.inventoryService.list();
    const referenceDate = referenceDateOf(orders);
    return {
      referenceDate,
      rows: computeForecast(orders, inventory, referenceDate),
    };
  }

  async anomalies(): Promise<{ referenceDate: string | null; anomalies: Anomaly[] }> {
    const orders = await this.ordersService.list();
    const inventory = await this.inventoryService.list();
    const returns = await this.returnsService.list();
    const referenceDate = referenceDateOf(orders);
    const found = detectAnomalies(orders, inventory, returns, referenceDate);
    // Tạo đề xuất cho mỗi bất thường mới (upsert theo anomalyKey): đề xuất
    // đã có quyết định không bao giờ bị ghi đè. Đây là tác dụng phụ của
    // GET /api/bi/anomalies, ghi rõ trong README của mô-đun.
    for (const anomaly of found) {
      const existing = await this.store.findRecommendationByKey(anomaly.key);
      if (existing) {
        continue;
      }
      const draft = recommendationDraftFor(anomaly);
      const now = new Date().toISOString();
      const rec: Recommendation = {
        id: `DX-${String(this.recSeq).padStart(4, '0')}`,
        anomalyKey: anomaly.key,
        type: anomaly.type,
        sku: anomaly.sku,
        channelId: anomaly.channelId,
        title: draft.title,
        action: draft.action,
        reason: draft.reason,
        inputs: anomaly.inputs,
        status: 'Chờ duyệt',
        decidedBy: null,
        decidedAt: null,
        decisionReason: null,
        createdAt: now,
        updatedAt: now,
      };
      this.recSeq += 1;
      await this.store.saveRecommendation(rec);
    }
    return { referenceDate, anomalies: found };
  }

  async listRecommendations(): Promise<Recommendation[]> {
    return this.store.listRecommendations();
  }

  async getRecommendation(id: string): Promise<Recommendation> {
    const rec = await this.store.findRecommendationById(id);
    if (!rec) {
      throw new NotFoundException(`Không tìm thấy đề xuất ${id}.`);
    }
    return rec;
  }

  // Thứ tự kiểm tra theo mẫu restricted-flags: dữ liệu đầu vào (400)
  // trước, trạng thái 'Chờ duyệt' (409) sau, quyền duyệt (409) cuối.
  // Từ chối bắt buộc có lý do.
  async decideRecommendation(
    id: string,
    input: DecisionRecommendationInput,
    caller: Caller,
  ): Promise<Recommendation> {
    if (
      !input ||
      (input.decision !== 'approved' && input.decision !== 'rejected')
    ) {
      throw new BadRequestException(
        "decision phải là 'approved' hoặc 'rejected'.",
      );
    }
    if (input.decision === 'rejected' && !input.reason) {
      throw new BadRequestException('Từ chối đề xuất bắt buộc phải có lý do.');
    }
    const rec = await this.getRecommendation(id);
    if (rec.status !== 'Chờ duyệt') {
      throw new ConflictException(
        `Đề xuất ${id} đã được quyết định (${rec.status}), không quyết định lại được.`,
      );
    }
    if (!caller.roles.some((role) => APPROVER_ROLES.includes(role))) {
      throw new ConflictException(DECISION_FORBIDDEN);
    }
    const decided: Recommendation = {
      ...rec,
      status: input.decision === 'approved' ? 'Đã duyệt' : 'Đã từ chối',
      decidedBy: caller.username,
      decidedAt: new Date().toISOString(),
      decisionReason: input.reason ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveRecommendation(decided);
    return decided;
  }

  // Phản hồi đối chiếu kết quả thật: chỉ cho đề xuất đã duyệt, mỗi đề xuất
  // tối đa 1 phản hồi. Chỉ Quản lý/Quản trị viên mới ghi phản hồi.
  async recordFeedback(
    id: string,
    input: RecordFeedbackInput,
    caller: Caller,
  ): Promise<AIFeedback> {
    if (!input || typeof input.correct !== 'boolean') {
      throw new BadRequestException('correct phải là true hoặc false.');
    }
    const rec = await this.getRecommendation(id);
    if (rec.status !== 'Đã duyệt') {
      throw new ConflictException(
        `Chỉ ghi phản hồi cho đề xuất đã duyệt, đề xuất ${id} đang ở trạng thái ${rec.status}.`,
      );
    }
    if (!caller.roles.some((role) => APPROVER_ROLES.includes(role))) {
      throw new ConflictException(
        'Chỉ Quản lý hoặc Quản trị viên mới được ghi phản hồi.',
      );
    }
    const existing = await this.store.findFeedbackByRecommendationId(id);
    if (existing) {
      throw new ConflictException(
        `Đề xuất ${id} đã có phản hồi, không ghi thêm được.`,
      );
    }
    const feedback: AIFeedback = {
      id: `PH-${String(this.feedbackSeq).padStart(4, '0')}`,
      recommendationId: id,
      correct: input.correct,
      note: input.note ?? null,
      recordedBy: caller.username,
      recordedAt: new Date().toISOString(),
    };
    this.feedbackSeq += 1;
    await this.store.saveFeedback(feedback);
    return feedback;
  }

  async listFeedback(): Promise<AIFeedback[]> {
    return this.store.listFeedback();
  }

  // Tính DX-Score v1 từ log thật (đơn, audit, phê duyệt, đề xuất, phản
  // hồi). Mỗi lần tính đều lưu 1 snapshot (append-only) kèm công thức,
  // nguồn log và thời điểm đóng băng.
  async dxScore(): Promise<DxScore> {
    const [orders, audit, approvals, recommendations, feedback, returns] =
      await Promise.all([
        this.ordersService.list(),
        this.auditService.getAll(),
        this.approvalsService.list({}),
        this.store.listRecommendations(),
        this.store.listFeedback(),
        this.returnsService.list(),
      ]);
    const referenceDate = referenceDateOf(orders);
    const inventory = await this.inventoryService.list();
    const forecast = computeForecast(orders, inventory, referenceDate);
    const anomalies = detectAnomalies(orders, inventory, returns, referenceDate);
    const computedAt = new Date().toISOString();
    const score = computeDxScore({
      orders,
      audit,
      approvals,
      recommendations,
      feedback,
      returns,
      forecast,
      anomalies,
      referenceDate,
      computedAt,
    });
    const snapshot: DxScoreSnapshot = {
      ...score,
      id: `SN-${String(this.snapshotSeq).padStart(4, '0')}`,
    };
    this.snapshotSeq += 1;
    await this.store.saveSnapshot(snapshot);
    return score;
  }

  async latestDxScoreSnapshot(): Promise<DxScoreSnapshot | null> {
    return this.store.latestSnapshot();
  }
}
