// SPDX-License-Identifier: Apache-2.0
import type { Approval } from '../approvals/approval.types';
import type { AuditRecord } from '../audit/audit.types';
import type { InventoryItem } from '../inventory/inventory.types';
import type { Order } from '../orders/orders.types';
import type { Return } from '../returns/return.types';
import type {
  AIFeedback,
  Anomaly,
  AnomalyType,
  DxRatio,
  DxScore,
  ForecastRow,
  Recommendation,
} from './bi.types';

// Lớp BI pilot chỉ dùng quy tắc xác định (mục 3 bản dự thảo): không mô hình
// học máy, không gọi LLM bên ngoài. Mọi hàm ở đây là hàm thuần: cùng dữ
// liệu đầu vào thì luôn trả cùng 1 kết quả, để kiểm thử đơn vị và để tính
// lại DX-Score 2 lần ra cùng 1 số.

export const LEAD_TIME_DAYS = 7;
export const RETURN_GAP_PP = 10;
export const MIN_CHANNEL_RETURNS = 3;
export const SPIKE_MULTIPLIER = 2;
export const MIN_BASELINE_UNITS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATES = ['Hoàn', 'Hủy'];
// Đơn đã giao = đơn từng đạt trạng thái 'Đã giao' (đang ở 'Đã giao' hoặc
// đã đóng 'Hoàn' sau khi giao xong).
const DELIVERED_STATES = ['Đã giao', 'Hoàn'];
// Actor hệ thống, không phải người: seed sinh dữ liệu mẫu và tác vụ hệ
// thống. Bước làm tay (trục H) là bước có actor khác 2 giá trị này.
const SYSTEM_ACTORS = ['seed', 'system'];
// 8 đơn demo DH-1001..DH-1008 có createdAt là thời điểm khởi động API,
// không phải thời gian nghiệp vụ, nên không dùng để neo cửa sổ 7 ngày:
// ngày tham chiếu của bộ dữ liệu mẫu đóng băng là ngày tạo đơn lịch sử
// mới nhất (22/11/2026). Đơn thật tạo tay (DH-1009 trở đi) có createdAt
// là thời gian thật nên vẫn neo cửa sổ bình thường.
export const DEMO_FIXTURE_ORDER_IDS = [
  'DH-1001',
  'DH-1002',
  'DH-1003',
  'DH-1004',
  'DH-1005',
  'DH-1006',
  'DH-1007',
  'DH-1008',
];

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function datePart(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 10);
}

// Ngày dữ liệu mới nhất (YYYY-MM-DD) của bộ dữ liệu: ngày tạo đơn mới
// nhất, trừ 8 đơn demo có createdAt là thời điểm khởi động. Hết đơn (trừ
// đơn demo) thì lấy ngày mới nhất của toàn bộ; không có đơn nào thì null.
export function referenceDateOf(orders: Order[]): string | null {
  const business = orders.filter(
    (order) => !DEMO_FIXTURE_ORDER_IDS.includes(order.id),
  );
  const pool = business.length > 0 ? business : orders;
  if (pool.length === 0) {
    return null;
  }
  let max = '';
  for (const order of pool) {
    const part = datePart(order.createdAt);
    if (part > max) {
      max = part;
    }
  }
  return max;
}

interface WindowBounds {
  lastStartMs: number;
  lastEndMs: number;
  prevStartMs: number;
  prevEndMs: number;
}

// Cửa sổ 7 ngày gần nhất = 7 ngày lịch kết thúc vào ngày tham chiếu (gồm
// cả ngày tham chiếu); cửa sổ trước đó = 7 ngày liền trước. Giới hạn tính
// theo UTC để không lệch theo múi giờ máy chủ.
function windowBounds(referenceDate: string): WindowBounds {
  const refMs = Date.parse(`${referenceDate}T00:00:00.000Z`);
  return {
    lastStartMs: refMs - 6 * DAY_MS,
    lastEndMs: refMs + DAY_MS,
    prevStartMs: refMs - 13 * DAY_MS,
    prevEndMs: refMs - 6 * DAY_MS,
  };
}

// Đơn bán trong cửa sổ: đơn ĐÃ GIAO (trạng thái 'Đã giao' hoặc 'Hoàn') có
// createdAt trong cửa sổ. Đơn chưa giao (Mới tạo, Đã kiểm tra, Chờ kho,
// Đang đóng gói, Chờ điều xe, Đang giao) chưa phải hàng đã bán; đơn hủy
// cũng không phải doanh số. Định nghĩa này khớp số liệu tiền điều kiện đã
// công bố trong src/seed/data/README.md (NM-35: 17 đơn vị trong 7 ngày
// cuối, mốc 7 đơn vị). Trả về số lượng theo SKU và theo cặp SKU+kênh.
function salesInWindow(
  orders: Order[],
  startMs: number,
  endMs: number,
): Map<string, { total: number; byChannel: Map<string, number> }> {
  const sales = new Map<
    string,
    { total: number; byChannel: Map<string, number> }
  >();
  for (const order of orders) {
    if (!DELIVERED_STATES.includes(order.state)) {
      continue;
    }
    const at = Date.parse(order.createdAt);
    if (Number.isNaN(at) || at < startMs || at >= endMs) {
      continue;
    }
    for (const item of order.items) {
      let entry = sales.get(item.sku);
      if (!entry) {
        entry = { total: 0, byChannel: new Map() };
        sales.set(item.sku, entry);
      }
      entry.total += item.quantity;
      if (order.channelId !== null) {
        entry.byChannel.set(
          order.channelId,
          (entry.byChannel.get(order.channelId) ?? 0) + item.quantity,
        );
      }
    }
  }
  return sales;
}

// Dự báo nhu cầu: tốc độ bán = số lượng bán 7 ngày gần nhất / 7; dự báo 7
// ngày tới = tốc độ x 7; số ngày tồn kho còn lại = tồn kho hiện tại / tốc
// độ. Tốc độ 0 thì ghi 'khong-ban', không tính bất thường cho SKU đó.
// Mỗi SKU có 1 dòng tổng hợp; cặp SKU+kênh có đơn trong cửa sổ thì có thêm
// 1 dòng riêng (tốc độ và dự báo của kênh đó, số ngày tồn kho dùng chung
// tồn kho của SKU vì kho dùng chung cho mọi kênh).
export function computeForecast(
  orders: Order[],
  inventory: InventoryItem[],
  referenceDate: string | null,
): ForecastRow[] {
  if (referenceDate === null) {
    return [];
  }
  const bounds = windowBounds(referenceDate);
  const last7 = salesInWindow(orders, bounds.lastStartMs, bounds.lastEndMs);
  const prev7 = salesInWindow(orders, bounds.prevStartMs, bounds.prevEndMs);
  const rows: ForecastRow[] = [];
  const sorted = [...inventory].sort((a, b) => a.sku.localeCompare(b.sku));
  for (const item of sorted) {
    const last = last7.get(item.sku);
    const prev = prev7.get(item.sku);
    const salesLast = last?.total ?? 0;
    const salesPrev = prev?.total ?? 0;
    const velocity = salesLast / 7;
    const daysLeft = velocity > 0 ? round2(item.stock / velocity) : null;
    rows.push({
      sku: item.sku,
      name: item.name,
      channelId: null,
      salesLast7d: salesLast,
      salesPrev7d: salesPrev,
      velocityPerDay: round2(velocity),
      forecast7d: salesLast,
      stock: item.stock,
      unitPrice: item.unitPrice,
      daysLeft,
      status: velocity > 0 ? 'binh-thuong' : 'khong-ban',
    });
    if (last) {
      const channels = [...last.byChannel.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      for (const [channelId, qty] of channels) {
        const channelVelocity = qty / 7;
        rows.push({
          sku: item.sku,
          name: item.name,
          channelId,
          salesLast7d: qty,
          salesPrev7d: prev?.byChannel.get(channelId) ?? 0,
          velocityPerDay: round2(channelVelocity),
          forecast7d: qty,
          stock: item.stock,
          unitPrice: item.unitPrice,
          daysLeft,
          status: 'binh-thuong',
        });
      }
    }
  }
  return rows;
}

function hasRepeatedState(order: Order): boolean {
  const seen = new Set<string>();
  for (const entry of order.history) {
    if (seen.has(entry.to)) {
      return true;
    }
    seen.add(entry.to);
  }
  return false;
}

// 3 bất thường dùng đúng ngưỡng đóng băng mục 3. Trả về theo thứ tự ổn
// định: tồn kho sắp hết (theo SKU), tỷ lệ hoàn cao (theo kênh), cầu tăng
// đột biến (theo SKU).
export function detectAnomalies(
  orders: Order[],
  inventory: InventoryItem[],
  returns: Return[],
  referenceDate: string | null,
): Anomaly[] {
  if (referenceDate === null) {
    return [];
  }
  const anomalies: Anomaly[] = [];
  const forecast = computeForecast(orders, inventory, referenceDate);
  const skuRows = forecast.filter((row) => row.channelId === null);

  // 1. Tồn kho sắp hết trong khi đơn vẫn vào: số ngày còn lại < 7 ngày
  // (thời gian nhập hàng đóng băng là 7 ngày) và có đơn bán trong 7 ngày
  // gần nhất (tốc độ > 0, dòng 'khong-ban' không tính).
  for (const row of skuRows) {
    if (
      row.status === 'binh-thuong' &&
      row.daysLeft !== null &&
      row.daysLeft < LEAD_TIME_DAYS
    ) {
      anomalies.push({
        key: `ton-kho-sap-het:${row.sku}`,
        type: 'ton-kho-sap-het',
        sku: row.sku,
        channelId: null,
        title: `Tồn kho sắp hết: ${row.sku}`,
        detail:
          `Tồn kho ${row.sku} còn ${row.stock} đơn vị, tốc độ bán ` +
          `${row.velocityPerDay} đơn vị/ngày, còn khoảng ${row.daysLeft} ngày.`,
        inputs: {
          stock: row.stock,
          velocityPerDay: row.velocityPerDay,
          daysLeft: row.daysLeft,
          forecast7d: row.forecast7d,
          leadTimeDays: LEAD_TIME_DAYS,
          salesLast7d: row.salesLast7d,
        },
        referenceDate,
      });
    }
  }

  // 2. Tỷ lệ hoàn cao bất thường theo kênh: tỷ lệ hoàn của kênh vượt tỷ lệ
  // hoàn chung hơn 10 điểm phần trăm, và kênh đó có ít nhất 3 đơn hoàn.
  // Tỷ lệ = số đơn hoàn / số đơn đã giao của kênh (đơn đã giao mới có thể
  // hoàn). Đơn không ghi kênh chỉ tính vào tỷ lệ chung.
  const byId = new Map(orders.map((order) => [order.id, order]));
  const deliveredByChannel = new Map<string, number>();
  let deliveredTotal = 0;
  for (const order of orders) {
    if (!DELIVERED_STATES.includes(order.state)) {
      continue;
    }
    deliveredTotal += 1;
    if (order.channelId !== null) {
      deliveredByChannel.set(
        order.channelId,
        (deliveredByChannel.get(order.channelId) ?? 0) + 1,
      );
    }
  }
  const returnsByChannel = new Map<string, number>();
  for (const ret of returns) {
    const order = byId.get(ret.orderId);
    if (!order || order.channelId === null) {
      continue;
    }
    returnsByChannel.set(
      order.channelId,
      (returnsByChannel.get(order.channelId) ?? 0) + 1,
    );
  }
  const overallRate =
    deliveredTotal === 0 ? 0 : (returns.length / deliveredTotal) * 100;
  const channels = [...returnsByChannel.keys()].sort();
  for (const channelId of channels) {
    const channelReturns = returnsByChannel.get(channelId) ?? 0;
    const channelDelivered = deliveredByChannel.get(channelId) ?? 0;
    if (channelDelivered === 0 || channelReturns < MIN_CHANNEL_RETURNS) {
      continue;
    }
    const channelRate = (channelReturns / channelDelivered) * 100;
    if (channelRate - overallRate > RETURN_GAP_PP) {
      anomalies.push({
        key: `ty-le-hoan-cao:${channelId}`,
        type: 'ty-le-hoan-cao',
        sku: null,
        channelId,
        title: `Tỷ lệ hoàn cao bất thường: kênh ${channelId}`,
        detail:
          `Tỷ lệ hoàn kênh ${channelId} ${round2(channelRate)}% vượt tỷ lệ ` +
          `chung ${round2(overallRate)}% tới ${round2(channelRate - overallRate)} điểm phần trăm, ` +
          `kênh có ${channelReturns} đơn hoàn.`,
        inputs: {
          channelReturnRate: round2(channelRate),
          overallReturnRate: round2(overallRate),
          gapPercentagePoints: round2(channelRate - overallRate),
          channelReturns,
          channelDelivered,
          overallReturns: returns.length,
          overallDelivered: deliveredTotal,
        },
        referenceDate,
      });
    }
  }

  // 3. Cầu tăng đột biến: doanh số 7 ngày gần nhất lớn hơn 2 lần mức nền
  // 7 ngày trước đó, mức nền ít nhất 5 đơn vị.
  for (const row of skuRows) {
    if (
      row.salesPrev7d >= MIN_BASELINE_UNITS &&
      row.salesLast7d > SPIKE_MULTIPLIER * row.salesPrev7d
    ) {
      anomalies.push({
        key: `cau-tang-dot-bien:${row.sku}`,
        type: 'cau-tang-dot-bien',
        sku: row.sku,
        channelId: null,
        title: `Cầu tăng đột biến: ${row.sku}`,
        detail:
          `Doanh số 7 ngày gần nhất ${row.salesLast7d} đơn vị, gấp ` +
          `${round2(row.salesLast7d / row.salesPrev7d)} lần mức nền ${row.salesPrev7d} đơn vị ` +
          `của 7 ngày trước đó.`,
        inputs: {
          salesLast7d: row.salesLast7d,
          salesPrev7d: row.salesPrev7d,
          ratio: round2(row.salesLast7d / row.salesPrev7d),
          spikeMultiplier: SPIKE_MULTIPLIER,
        },
        referenceDate,
      });
    }
  }
  return anomalies;
}

// Đề xuất hành động kèm giải thích cho 1 bất thường: hiện rõ đầu vào và lý
// do, theo đúng ví dụ ở mục 3 bản dự thảo. Số lượng nhập thêm = dự báo 7
// ngày - tồn kho hiện tại (luôn dương khi bất thường tồn kho sắp hết xảy
// ra, vì tồn kho < tốc độ x 7).
export function recommendationDraftFor(anomaly: Anomaly): {
  title: string;
  action: string;
  reason: string;
} {
  if (anomaly.type === 'ton-kho-sap-het') {
    const amount = Math.max(
      0,
      (anomaly.inputs.forecast7d as number) -
        (anomaly.inputs.stock as number),
    );
    return {
      title: `Nhập thêm ${anomaly.sku ?? ''}`,
      action: `Nhập thêm ${amount} đơn vị trước ngày hết kho (còn ${anomaly.inputs.daysLeft as number} ngày).`,
      reason: anomaly.detail,
    };
  }
  if (anomaly.type === 'ty-le-hoan-cao') {
    return {
      title: `Rà soát kênh ${anomaly.channelId ?? ''}`,
      action:
        'Kiểm tra chất lượng và mô tả sản phẩm của kênh, tạm thời giảm nhận đơn kênh đó.',
      reason: anomaly.detail,
    };
  }
  return {
    title: `Chuẩn bị hàng cho ${anomaly.sku ?? ''}`,
    action: 'Tăng tồn kho an toàn và chuẩn bị đóng gói cho SKU đó.',
    reason: anomaly.detail,
  };
}

function unmeasured(note: string): DxRatio {
  return { value: null, n: 0, measured: false, note };
}

function measuredRatio(value: number, n: number, note: string): DxRatio {
  return { value: round2(value), n, measured: true, note };
}

// DX-Score v1 theo đúng công thức đóng băng mục 2 bản dự thảo. Mỗi trục
// P, D, I tối đa 30 điểm, H = 100 - P - D - I. Mẫu số 0 thì trục con đó ghi
// "chưa đo", tính 0 điểm, không ước lượng. Hàm thuần: cùng dữ liệu đầu vào
// thì luôn trả cùng 1 số (làm tròn 2 chữ số thập phân trước khi cộng H để
// tổng 4 trục luôn bằng 100).
export function computeDxScore(input: {
  orders: Order[];
  audit: AuditRecord[];
  approvals: Approval[];
  recommendations: Recommendation[];
  feedback: AIFeedback[];
  returns: Return[];
  forecast: ForecastRow[];
  anomalies: Anomaly[];
  referenceDate: string | null;
  computedAt: string;
}): DxScore {
  const { orders, audit, approvals, recommendations, feedback, returns } =
    input;
  const referenceDate = input.referenceDate ?? '';

  // Trục P: trung bình 2 tỷ lệ, nhân 30.
  const closed = orders.filter((order) =>
    CLOSED_STATES.includes(order.state),
  );
  const closedWithoutDetour = closed.filter(
    (order) => !hasRepeatedState(order),
  );
  const p1 =
    closed.length === 0
      ? unmeasured('Chưa có đơn đã đóng nên chưa đo được tỷ lệ đi tròn luồng.')
      : measuredRatio(
          closedWithoutDetour.length / closed.length,
          closed.length,
          `${closedWithoutDetour.length}/${closed.length} đơn đã đóng đi tròn luồng không đi đường vòng.`,
        );
  const denied = audit.filter((record) =>
    record.action.endsWith('.transition.denied'),
  );
  const p2 =
    denied.length === 0
      ? unmeasured(
          'Chưa có lần thử chuyển trái phép nào trong log nên chưa đo được tỷ lệ chặn.',
        )
      : measuredRatio(
          1,
          denied.length,
          `${denied.length} lần thử chuyển trái phép đều bị rào chắn chặn lại.`,
        );
  const pScore = round2(30 * ((p1.value ?? 0) + (p2.value ?? 0)) / 2);

  // Trục D: trung bình 2 tỷ lệ, nhân 30.
  const indicatorCount = input.forecast.length + input.anomalies.length;
  const d1 =
    indicatorCount === 0
      ? unmeasured('Chưa có chỉ số BI nào nên chưa đo được tỷ lệ ghi nguồn.')
      : measuredRatio(
          1,
          indicatorCount,
          `${indicatorCount} chỉ số BI đều kèm nguồn dữ liệu và ngày tham chiếu ${referenceDate}.`,
        );
  const createdByOrder = new Set(
    audit
      .filter((record) => record.action === 'order.created')
      .map((record) => record.orderId),
  );
  const withLineage = orders.filter(
    (order) =>
      order.history.length > 0 &&
      order.history[0].from === null &&
      order.history[0].to === 'Mới tạo' &&
      createdByOrder.has(order.id),
  );
  const d2 =
    orders.length === 0
      ? unmeasured('Chưa có đơn nào nên chưa đo được tỷ lệ phả hệ đầy đủ.')
      : measuredRatio(
          withLineage.length / orders.length,
          orders.length,
          `${withLineage.length}/${orders.length} đơn có phả hệ đầy đủ tới đơn gốc (lịch sử từ tạo đơn + bản ghi audit order.created).`,
        );
  const dScore = round2(30 * ((d1.value ?? 0) + (d2.value ?? 0)) / 2);

  // Trục I: tỷ lệ đề xuất được duyệt và đúng khi đối chiếu kết quả thật.
  const approved = recommendations.filter(
    (rec) => rec.status === 'Đã duyệt',
  );
  const feedbackByRec = new Map(
    feedback.map((item) => [item.recommendationId, item]),
  );
  const correctApproved = approved.filter(
    (rec) => feedbackByRec.get(rec.id)?.correct === true,
  );
  const iRatio =
    approved.length === 0
      ? unmeasured('Chưa có đề xuất nào được duyệt nên chưa đo được tỷ lệ đúng.')
      : measuredRatio(
          correctApproved.length / approved.length,
          approved.length,
          `${correctApproved.length}/${approved.length} đề xuất được duyệt đã xác minh đúng.`,
        );
  const iScore = round2(30 * (iRatio.value ?? 0));

  // Trục H: phần còn lại, không chấm bằng 1 công thức riêng. 4 chỉ số đo
  // trực tiếp từ log.
  const manual = audit.filter(
    (record) => !SYSTEM_ACTORS.includes(record.actor),
  );
  const manualStepRatio =
    audit.length === 0
      ? unmeasured('Chưa có bản ghi log nào nên chưa đo được tỷ lệ bước làm tay.')
      : measuredRatio(
          manual.length / audit.length,
          audit.length,
          `${manual.length}/${audit.length} bước trong log do con người thực hiện (actor khác 'seed' và 'system').`,
        );
  const decided = approvals.filter(
    (approval) => approval.decidedAt !== null,
  );
  const waitByType = new Map<string, { total: number; n: number }>();
  for (const approval of decided) {
    const wait =
      Date.parse(approval.decidedAt as string) -
      Date.parse(approval.requestedAt);
    const entry = waitByType.get(approval.type) ?? { total: 0, n: 0 };
    entry.total += wait;
    entry.n += 1;
    waitByType.set(approval.type, entry);
  }
  const avgApprovalWaitMsByType = [...waitByType.entries()]
    .map(([type, entry]) => ({
      type,
      avgMs: Math.round(entry.total / entry.n),
      n: entry.n,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
  const decisionsByRoleDay = new Map<string, number>();
  for (const record of audit) {
    if (
      record.action !== 'approval.approved' &&
      record.action !== 'approval.rejected'
    ) {
      continue;
    }
    const key = `${record.role}|${datePart(record.at)}`;
    decisionsByRoleDay.set(key, (decisionsByRoleDay.get(key) ?? 0) + 1);
  }
  const decisionsPerPersonPerDayByRole = [...decisionsByRoleDay.entries()]
    .map(([key, count]) => {
      const [role, date] = key.split('|');
      return { role, date, count };
    })
    .sort((a, b) =>
      a.date === b.date
        ? a.role.localeCompare(b.role)
        : a.date.localeCompare(b.date),
    );
  // Tỷ lệ ngoại lệ: đơn hủy, đơn có trả hàng, hoặc đơn đi đường vòng
  // (lịch sử lặp lại 1 trạng thái, ví dụ giao thất bại quay lại Chờ điều
  // xe). Mỗi đơn chỉ đếm 1 lần.
  const returnedOrderIds = new Set(returns.map((ret) => ret.orderId));
  const exceptionOrders = orders.filter(
    (order) =>
      order.state === 'Hủy' ||
      hasRepeatedState(order) ||
      returnedOrderIds.has(order.id),
  );
  const hScore = round2(100 - pScore - dScore - iScore);

  return {
    formulaVersion: 'v1',
    referenceDate,
    computedAt: input.computedAt,
    p: { score: pScore, closedWithoutDetour: p1, illegalBlocked: p2 },
    d: { score: dScore, attributedIndicators: d1, fullLineage: d2 },
    i: {
      score: iScore,
      correctApproved: iRatio,
      smallSample: approved.length < 5,
    },
    h: {
      score: hScore,
      manualStepRatio,
      avgApprovalWaitMsByType,
      decisionsPerPersonPerDayByRole,
      exceptionRatio:
        orders.length === 0
          ? unmeasured('Chưa có đơn nào nên chưa đo được tỷ lệ ngoại lệ.')
          : measuredRatio(
              exceptionOrders.length / orders.length,
              orders.length,
              `${exceptionOrders.length}/${orders.length} đơn phải xử lý ngoại lệ (hủy, hoàn hàng hoặc đi đường vòng).`,
            ),
    },
    total: round2(pScore + dScore + iScore + hScore),
  };
}
