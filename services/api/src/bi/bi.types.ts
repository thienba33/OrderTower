// SPDX-License-Identifier: Apache-2.0

// Loại bất thường của lớp BI pilot. Ngưỡng đóng băng ở mục 3 bản dự thảo
// (du-thao-bi-pilot-va-dx-score-moc3.md): tồn kho sắp hết khi số ngày tồn
// kho còn lại < 7 ngày và có đơn bán trong 7 ngày gần nhất; tỷ lệ hoàn kênh
// vượt chung hơn 10 điểm phần trăm và kênh có ít nhất 3 đơn hoàn; cầu tăng
// đột biến khi doanh số 7 ngày gần nhất > 2 lần mốc 7 ngày trước, mốc ít
// nhất 5 đơn vị.
export type AnomalyType =
  | 'ton-kho-sap-het'
  | 'ty-le-hoan-cao'
  | 'cau-tang-dot-bien';

// 1 dòng dự báo nhu cầu theo SKU, hoặc theo cặp SKU + kênh khi cặp đó có
// đơn trong cửa sổ 7 ngày. Cửa sổ neo vào ngày dữ liệu mới nhất (xem
// bi.compute.ts), không neo vào ngày hiện tại.
export interface ForecastRow {
  sku: string;
  name: string | null;
  // null = tổng hợp mọi kênh; có giá trị = chỉ kênh đó.
  channelId: string | null;
  // Đơn vị bán trong 7 ngày gần nhất.
  salesLast7d: number;
  // Đơn vị bán trong 7 ngày trước đó (làm mốc cho bất thường cầu tăng).
  salesPrev7d: number;
  // Tốc độ bán = số lượng bán 7 ngày gần nhất / 7.
  velocityPerDay: number;
  // Dự báo 7 ngày tới = tốc độ bán x 7.
  forecast7d: number;
  // Tồn kho khả dụng hiện tại.
  stock: number;
  unitPrice: number | null;
  // Số ngày tồn kho còn lại = tồn kho / tốc độ; null khi tốc độ 0.
  daysLeft: number | null;
  // 'khong-ban' khi tốc độ 0: SKU không bán trong 7 ngày gần nhất, không
  // tính bất thường cho SKU đó.
  status: 'binh-thuong' | 'khong-ban';
}

// 1 bất thường phát hiện bằng quy tắc xác định. inputs ghi rõ mọi con số
// đầu vào để người duyệt kiểm tra lại được, không có số nào không rõ nguồn.
export interface Anomaly {
  // Khóa ổn định của bất thường (loại + SKU/kênh), đề xuất gắn theo khóa
  // này: gọi GET /api/bi/anomalies nhiều lần không tạo đề xuất trùng.
  key: string;
  type: AnomalyType;
  sku: string | null;
  channelId: string | null;
  title: string;
  detail: string;
  inputs: Record<string, number | string | null>;
  // Ngày dữ liệu mới nhất mà bất thường neo vào (YYYY-MM-DD).
  referenceDate: string;
}

export type RecommendationStatus = 'Chờ duyệt' | 'Đã duyệt' | 'Đã từ chối';

// 1 đề xuất hành động của lớp BI (thực thể AIRecommendation trong plan
// mục 5). BI chỉ đề xuất, không tự đặt hàng, không tự dừng nhận đơn.
// Đề xuất sinh ra từ bất thường (GET /api/bi/anomalies), chỉ Quản lý hoặc
// Quản trị viên duyệt/từ chối kèm lý do.
export interface Recommendation {
  id: string;
  anomalyKey: string;
  type: AnomalyType;
  sku: string | null;
  channelId: string | null;
  title: string;
  action: string;
  reason: string;
  inputs: Record<string, number | string | null>;
  status: RecommendationStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionRecommendationInput {
  decision: 'approved' | 'rejected';
  reason?: string;
}

// Phản hồi đối chiếu kết quả thật của 1 đề xuất đã duyệt (thực thể
// AIFeedback trong plan mục 5). Chỉ ghi cho đề xuất đã duyệt, mỗi đề xuất
// tối đa 1 phản hồi: đề xuất được duyệt và xác minh đúng mới tính vào trục
// I của DX-Score.
export interface AIFeedback {
  id: string;
  recommendationId: string;
  correct: boolean;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface RecordFeedbackInput {
  correct: boolean;
  note?: string;
}

// 1 tỷ lệ thành phần của DX-Score. value null + measured false nghĩa là
// "chưa đo" (mẫu số 0): tính 0 điểm, không ước lượng, theo mục 2 bản dự
// thảo. n là cỡ mẫu của tỷ lệ.
export interface DxRatio {
  value: number | null;
  n: number;
  measured: boolean;
  note: string;
}

// Điểm DX-Score v1 (công thức đóng băng mục 2 bản dự thảo). Mỗi trục P, D,
// I tối đa 30 điểm, H là phần còn lại: H = 100 - P - D - I. Tổng 4 trục
// luôn bằng 100 theo định nghĩa.
export interface DxScore {
  formulaVersion: 'v1';
  // Ngày dữ liệu mới nhất (YYYY-MM-DD) mà điểm neo vào.
  referenceDate: string;
  computedAt: string;
  p: {
    score: number;
    // Đơn đã đóng đi tròn luồng không đi đường vòng / tổng đơn đã đóng.
    closedWithoutDetour: DxRatio;
    // Chuyển trạng thái trái phép bị rào chắn chặn lại / tổng lần thử
    // chuyển trái phép (ghi trong audit).
    illegalBlocked: DxRatio;
  };
  d: {
    score: number;
    // Chỉ số BI có nguồn dữ liệu và thời điểm đóng băng rõ ràng / tổng chỉ
    // số BI trả về (phạm vi pilot: chỉ số do chính lớp BI trả ra).
    attributedIndicators: DxRatio;
    // Đơn có phả hệ đầy đủ tới đơn gốc (lịch sử bắt đầu từ tạo đơn + có bản
    // ghi audit order.created) / tổng đơn.
    fullLineage: DxRatio;
  };
  i: {
    score: number;
    // Đề xuất được duyệt và xác minh đúng / tổng đề xuất đã duyệt.
    correctApproved: DxRatio;
    // true khi tổng đề xuất đã duyệt < 5: điểm chỉ có giá trị minh họa.
    smallSample: boolean;
  };
  h: {
    score: number;
    // 4 chỉ số đo trực tiếp từ log, không chấm bằng 1 công thức riêng.
    manualStepRatio: DxRatio;
    avgApprovalWaitMsByType: { type: string; avgMs: number; n: number }[];
    decisionsPerPersonPerDayByRole: {
      role: string;
      date: string;
      count: number;
    }[];
    exceptionRatio: DxRatio;
  };
  total: number;
}

// 1 lần tính DX-Score ghi bền (thực thể DXScoreSnapshot trong plan mục 5):
// điểm kèm công thức, nguồn log, thời điểm đóng băng, bấm xuống được log
// gốc qua các tỷ lệ thành phần (n, ghi chú) và ngày tham chiếu.
export interface DxScoreSnapshot extends DxScore {
  id: string;
}

// Lối ra vào kho BI. Hiện có bản bộ nhớ; bản Postgres lưu bền qua cùng
// interface này, service phía trên không đổi. Mọi phương thức đều bất đồng
// bộ vì kho Postgres cần chờ truy vấn.
export interface BiStore {
  saveRecommendation(rec: Recommendation): Promise<void>;
  findRecommendationById(id: string): Promise<Recommendation | null>;
  findRecommendationByKey(key: string): Promise<Recommendation | null>;
  listRecommendations(): Promise<Recommendation[]>;
  saveFeedback(feedback: AIFeedback): Promise<void>;
  findFeedbackByRecommendationId(
    recommendationId: string,
  ): Promise<AIFeedback | null>;
  listFeedback(): Promise<AIFeedback[]>;
  saveSnapshot(snapshot: DxScoreSnapshot): Promise<void>;
  latestSnapshot(): Promise<DxScoreSnapshot | null>;
  listSnapshots(): Promise<DxScoreSnapshot[]>;
}
