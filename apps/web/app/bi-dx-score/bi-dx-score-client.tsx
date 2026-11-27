"use client";

// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import ColdDataSourceSection from "./cold-data-source-section";
import LineageSection from "./lineage-section";
import {
  BI_TABS,
  type ApiDxRatio,
  type ApiDxScore,
  type ApiFeedback,
  type ApiForecastRow,
  type ApiRecommendation,
  type BiDxScoreClientProps,
  type BiSectionError,
  type BiTab,
} from "./bi-dx-score-types";

const PAGE_SIZE = 5;
const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

// Việc cần làm: liên kết tĩnh tới các màn liên quan, không phải dữ liệu
// BI, giữ nguyên như màn đóng băng.
const BI_TODOS = [
  { rank: 1, text: "Chuẩn bị nhập lô L-118", button: "Xem tồn kho", href: "/warehouse" },
  { rank: 2, text: "Xem đơn hoàn kênh Chat", button: "Xem đơn hoàn", href: "/customer-care" },
  { rank: 3, text: "Duyệt đề xuất đổi xe DH-1051", button: "Xem đề xuất", href: "/approval-queue" },
];

// Thay đổi tuần này so với tuần trước (mốc 7 ngày trước đó). Dự báo 7
// ngày tới của API bằng đúng số bán 7 ngày gần nhất nên so với tuần
// trước mới thấy cầu tăng hay giảm.
function changePercent(row: ApiForecastRow): number {
  if (row.salesPrev7d === 0) return 0;
  return Math.round(
    ((row.salesLast7d - row.salesPrev7d) / row.salesPrev7d) * 100,
  );
}

function formatChange(percent: number): string {
  if (percent === 0) return "0%";
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

// Giải thích đầu vào của 1 dòng dự báo, dựng từ số liệu thật của dòng.
function forecastExplanation(row: ApiForecastRow): string {
  if (row.status === "khong-ban") {
    return "Không bán trong 7 ngày gần nhất";
  }
  const days =
    row.daysLeft === null ? "" : `, còn khoảng ${row.daysLeft} ngày`;
  return `Tốc độ bán ${row.velocityPerDay}/ngày, tồn kho ${row.stock}${days}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} giây`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} phút`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} giờ`;
  return `${Math.round(ms / 86_400_000)} ngày`;
}

// Giá trị 1 tỷ lệ thành phần của DX-Score: phần trăm kèm cỡ mẫu, hoặc
// "Chưa đo" khi chưa đo được.
function ratioValue(ratio: ApiDxRatio): string {
  if (!ratio.measured || ratio.value === null) return "Chưa đo";
  return `${Math.round(ratio.value * 100)}% (n=${ratio.n})`;
}

// Lấy message từ lỗi của route handler ({message} là chuỗi hoặc mảng).
async function errorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    const message = (data as Record<string, unknown> | null)?.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
    if (Array.isArray(message)) {
      const text = message.filter((item) => typeof item === "string").join("; ");
      if (text.length > 0) {
        return text;
      }
    }
  } catch {
    // Rơi xuống thông báo mặc định ở dưới.
  }
  return `Máy chủ trả về ${response.status}.`;
}

function SectionError({ error }: { error: BiSectionError }) {
  if (error === "unauthorized") {
    return (
      <p className="p-4 text-sm text-gray-700">
        Phiên đăng nhập đã hết hạn.{" "}
        <Link href="/api/auth/login" className="font-medium text-red-700 underline">
          Đăng nhập lại
        </Link>
      </p>
    );
  }
  return (
    <p className="p-4 text-sm text-gray-700">
      Không tải được dữ liệu. Thử tải lại trang.
    </p>
  );
}

type DxPeriodRow = {
  label: string;
  p: number;
  d: number;
  i: number;
  total: number;
  h: number;
  source: string;
};

type DxLogRow = {
  id: string;
  metric: string;
  value: string;
  source: string;
  time: string;
};

export default function BiDxScorePage({
  forecastRows,
  channelNameById,
  anomalies,
  recommendations,
  feedback,
  dxScore,
  latestSnapshot,
  forecastError,
  biError,
  dxError,
  archiveSummary,
  coldAnalytics,
  coldError,
  lineage,
  lineageError,
  roles,
}: BiDxScoreClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BiTab>("Tổng quan");
  const [page, setPage] = useState(1);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectHint, setRejectHint] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canDecide =
    roles.includes("Quản lý") || roles.includes("Quản trị viên");

  const anomalyByKey = useMemo(
    () => new Map(anomalies.map((anomaly) => [anomaly.key, anomaly])),
    [anomalies],
  );
  const feedbackByRecommendation = useMemo(
    () => new Map(feedback.map((item) => [item.recommendationId, item])),
    [feedback],
  );

  const aggregateRows = useMemo(
    () => forecastRows.filter((row) => row.channelId === null),
    [forecastRows],
  );
  const skuWithHistory = aggregateRows.filter(
    (row) => row.status === "binh-thuong",
  ).length;
  const pendingRecommendations = recommendations.filter(
    (rec) => rec.status === "Chờ duyệt",
  ).length;
  const referenceDate =
    dxScore?.referenceDate ?? anomalies[0]?.referenceDate ?? null;

  const miniRows = useMemo(() => {
    const channelRows = forecastRows.filter((row) => row.channelId !== null);
    const sorted = [...channelRows]
      .sort((a, b) => b.forecast7d - a.forecast7d)
      .slice(0, 3);
    const max =
      sorted.length > 0
        ? Math.max(...sorted.map((row) => row.forecast7d))
        : 0;
    return sorted.map((row) => ({
      ...row,
      barPercent: max === 0 ? 0 : Math.round((row.forecast7d / max) * 100),
      change: changePercent(row),
    }));
  }, [forecastRows]);

  // Hàng theo kênh và hàng sắp hết tồn kho, dùng cho các tab Kênh bán và
  // Tồn kho. daysLeft có sẵn trên từng dòng dự báo; chỉ khi API chưa trả
  // daysLeft mới suy ra từ bất thường loại hết tồn kho.
  const channelRows = useMemo(
    () => forecastRows.filter((row) => row.channelId !== null),
    [forecastRows],
  );
  const lowStockRows = useMemo(() => {
    const aggregate = forecastRows.filter((row) => row.channelId === null);
    if (aggregate.some((row) => row.daysLeft !== null)) {
      return aggregate.filter(
        (row) => row.daysLeft !== null && row.daysLeft < 7,
      );
    }
    const lowSkus = new Set(
      anomalies
        .filter((anomaly) => anomaly.type === "ton-kho-sap-het")
        .map((anomaly) => anomaly.sku),
    );
    return aggregate.filter((row) => lowSkus.has(row.sku));
  }, [forecastRows, anomalies]);

  // Mỗi tab bảng dùng một tập dòng riêng; đổi tab thì về trang 1 để
  // không kẹt ở số trang vượt quá tổng số trang của tập mới.
  const tabRows = useMemo(() => {
    if (activeTab === "Kênh bán") return channelRows;
    if (activeTab === "Tồn kho") return lowStockRows;
    if (activeTab === "Thực tế" || activeTab === "Dự báo") return forecastRows;
    return [];
  }, [activeTab, channelRows, lowStockRows, forecastRows]);

  const totalPages = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return tabRows.slice(start, start + PAGE_SIZE);
  }, [tabRows, page]);
  const range = useMemo(
    () => ({
      start: (page - 1) * PAGE_SIZE + 1,
      end: Math.min(page * PAGE_SIZE, tabRows.length),
      total: tabRows.length,
    }),
    [tabRows, page],
  );

  const decide = async (
    id: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) => {
    setActionError(null);
    setBusyId(id);
    try {
      const response = await fetch(
        `/api/bi/recommendations/${encodeURIComponent(id)}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            reason === undefined ? { decision } : { decision, reason },
          ),
        },
      );
      if (!response.ok) {
        setActionError(await errorMessage(response));
        return;
      }
      setRejectId(null);
      setRejectReason("");
      setRejectHint(false);
      router.refresh();
    } catch {
      setActionError("Không gọi được máy chủ.");
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = (id: string) => {
    // Từ chối bắt buộc có lý do (API cũng chặn): chưa nhập thì không gửi.
    if (rejectReason.trim().length === 0) {
      setRejectHint(true);
      return;
    }
    setRejectHint(false);
    void decide(id, "rejected", rejectReason.trim());
  };

  const recordFeedback = async (id: string, correct: boolean) => {
    setActionError(null);
    setBusyId(id);
    try {
      const response = await fetch(
        `/api/bi/recommendations/${encodeURIComponent(id)}/feedback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ correct }),
        },
      );
      if (!response.ok) {
        setActionError(await errorMessage(response));
        return;
      }
      router.refresh();
    } catch {
      setActionError("Không gọi được máy chủ.");
    } finally {
      setBusyId(null);
    }
  };

  const forecastColumns: TableColumn<ApiForecastRow>[] = [
    { key: "sku", header: "SKU", render: (row) => <span className="font-medium text-gray-900">{row.sku}</span>, cellClassName: "w-[129px]" },
    { key: "name", header: "Sản phẩm", render: (row) => row.name ?? row.sku, cellClassName: "w-[218px]" },
    { key: "channel", header: "Kênh", render: (row) => row.channelId === null ? "Tất cả" : (channelNameById[row.channelId] ?? row.channelId), cellClassName: "w-[119px]" },
    { key: "lastWeek", header: "Tuần trước", render: (row) => String(row.salesLast7d), cellClassName: "w-[129px]" },
    { key: "forecast", header: "Dự báo", render: (row) => String(row.forecast7d), cellClassName: "w-[129px]" },
    {
      key: "change",
      header: "Thay đổi",
      render: (row) => {
        const percent = changePercent(row);
        return (
          <span className={percent >= 40 ? "font-medium text-red-700" : "text-gray-700"}>
            {formatChange(percent)}
          </span>
        );
      },
      cellClassName: "w-[129px]",
    },
    { key: "explanation", header: "Giải thích (đầu vào)", render: (row) => forecastExplanation(row), cellClassName: "w-[299px] !whitespace-normal" },
  ];

  // Tab Thực tế chỉ hiện doanh số thật: 7 ngày qua so với 7 ngày trước
  // đó, cùng cột thay đổi; không hiện dự báo và giải thích.
  const actualColumns: TableColumn<ApiForecastRow>[] = [
    ...forecastColumns.filter((column) =>
      ["sku", "name", "channel", "lastWeek"].includes(column.key),
    ),
    { key: "prevWeek", header: "7 ngày trước đó", render: (row) => String(row.salesPrev7d), cellClassName: "w-[129px]" },
    ...forecastColumns.filter((column) => column.key === "change"),
  ];

  // Tab Tồn kho chỉ hiện các SKU sắp hết hàng, kèm số ngày còn lại.
  const lowStockColumns: TableColumn<ApiForecastRow>[] = [
    { key: "sku", header: "SKU", render: (row) => <span className="font-medium text-gray-900">{row.sku}</span>, cellClassName: "w-[129px]" },
    { key: "name", header: "Sản phẩm", render: (row) => row.name ?? row.sku, cellClassName: "w-[218px]" },
    { key: "stock", header: "Tồn kho", render: (row) => String(row.stock), cellClassName: "w-[129px]" },
    { key: "velocity", header: "Tốc độ bán/ngày", render: (row) => String(row.velocityPerDay), cellClassName: "w-[129px]" },
    { key: "daysLeft", header: "Số ngày còn lại", render: (row) => (row.daysLeft === null ? "-" : String(row.daysLeft)), cellClassName: "w-[129px]" },
    { key: "forecast", header: "Dự báo 7 ngày", render: (row) => String(row.forecast7d), cellClassName: "w-[129px]" },
  ];

  const renderRecommendationActions = (row: ApiRecommendation) => {
    if (row.status === "Đã từ chối") {
      return (
        <span className="text-xs text-gray-700">
          Đã từ chối
          {row.decisionReason ? `: ${row.decisionReason}` : ""}
        </span>
      );
    }
    if (row.status === "Đã duyệt") {
      const recorded = feedbackByRecommendation.get(row.id);
      return (
        <span className="flex flex-col gap-2 text-xs font-medium">
          <span className="text-gray-700">Đã duyệt</span>
          {recorded ? (
            <span className="text-gray-500">
              Đã xác minh: {recorded.correct ? "Đúng" : "Sai"}
            </span>
          ) : canDecide ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void recordFeedback(row.id, true)}
                className="text-red-700 underline disabled:opacity-40"
              >
                Đúng
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void recordFeedback(row.id, false)}
                className="text-gray-500 underline disabled:opacity-40"
              >
                Sai
              </button>
            </span>
          ) : (
            <span className="text-gray-500">Chưa xác minh</span>
          )}
        </span>
      );
    }
    if (!canDecide) {
      return <span className="text-xs text-gray-500">Chờ duyệt</span>;
    }
    if (rejectId === row.id) {
      return (
        <span className="flex flex-col gap-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Lý do từ chối (bắt buộc)"
            className="h-8 w-full rounded-md border border-gray-300 px-2 text-xs text-gray-900"
          />
          {rejectHint && (
            <span className="text-xs text-red-700">Nhập lý do từ chối.</span>
          )}
          <span className="flex items-center gap-2 text-xs font-medium">
            <button
              type="button"
              disabled={busyId === row.id}
              onClick={() => submitReject(row.id)}
              className="text-red-700 underline disabled:opacity-40"
            >
              Gửi từ chối
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectId(null);
                setRejectReason("");
                setRejectHint(false);
              }}
              className="text-gray-500 underline"
            >
              Hủy
            </button>
          </span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2 text-xs font-medium">
        <button
          type="button"
          disabled={busyId === row.id}
          onClick={() => void decide(row.id, "approved")}
          className="text-red-700 underline disabled:opacity-40"
        >
          Duyệt
        </button>
        <button
          type="button"
          disabled={busyId === row.id}
          onClick={() => {
            setRejectId(row.id);
            setRejectReason("");
            setRejectHint(false);
          }}
          className="text-gray-500 underline disabled:opacity-40"
        >
          Từ chối
        </button>
      </span>
    );
  };

  const anomalyColumns: TableColumn<ApiRecommendation>[] = [
    { key: "title", header: "Bất thường", render: (row) => <span className="font-medium text-gray-900">{row.title}</span>, cellClassName: "w-[219px]" },
    { key: "evidence", header: "Bằng chứng", render: (row) => anomalyByKey.get(row.anomalyKey)?.detail ?? row.reason, cellClassName: "w-[319px] !whitespace-normal" },
    { key: "proposal", header: "Đề xuất hành động", render: (row) => row.action, cellClassName: "w-[298px] !whitespace-normal" },
    { key: "approver", header: "Người duyệt", render: (row) => row.decidedBy ?? "Chờ duyệt", cellClassName: "w-[119px]" },
    { key: "actions", header: "Hành động", render: (row) => renderRecommendationActions(row), cellClassName: "w-[199px]" },
  ];

  const recommendationById = useMemo(
    () => new Map(recommendations.map((rec) => [rec.id, rec])),
    [recommendations],
  );

  // Bảng phản hồi đã ghi, dùng cho tab Hoạt động.
  const feedbackColumns: TableColumn<ApiFeedback>[] = [
    { key: "title", header: "Đề xuất", render: (item) => recommendationById.get(item.recommendationId)?.title ?? item.recommendationId, cellClassName: "w-[259px] !whitespace-normal" },
    { key: "correct", header: "Xác minh", render: (item) => (item.correct ? "Đúng" : "Sai"), cellClassName: "w-[119px]" },
    { key: "by", header: "Người ghi", render: (item) => item.recordedBy, cellClassName: "w-[159px]" },
    { key: "at", header: "Thời gian", render: (item) => formatDateTime(item.recordedAt), cellClassName: "w-[159px]" },
    { key: "note", header: "Ghi chú", render: (item) => item.note ?? "-", cellClassName: "w-[258px] !whitespace-normal" },
  ];

  const dxAxes = dxScore
    ? [
        { key: "P", value: dxScore.p.score, max: 30 },
        { key: "D", value: dxScore.d.score, max: 30 },
        { key: "I", value: dxScore.i.score, max: 30 },
        { key: "H", value: dxScore.h.score, max: 100 },
      ]
    : [];

  const dxNotes: string[] = [];
  if (dxScore) {
    if (!dxScore.p.closedWithoutDetour.measured) {
      dxNotes.push(dxScore.p.closedWithoutDetour.note);
    }
    if (!dxScore.p.illegalBlocked.measured) {
      dxNotes.push(dxScore.p.illegalBlocked.note);
    }
    if (!dxScore.d.attributedIndicators.measured) {
      dxNotes.push(dxScore.d.attributedIndicators.note);
    }
    if (!dxScore.d.fullLineage.measured) {
      dxNotes.push(dxScore.d.fullLineage.note);
    }
    if (!dxScore.i.correctApproved.measured) {
      dxNotes.push(dxScore.i.correctApproved.note);
    }
    if (dxScore.i.smallSample) {
      dxNotes.push("Mẫu nhỏ: điểm trục I chỉ có giá trị minh họa.");
    }
  }

  const dxPeriodRows: DxPeriodRow[] = [];
  if (dxScore) {
    dxPeriodRows.push({
      label: "Điểm hiện tại",
      p: dxScore.p.score,
      d: dxScore.d.score,
      i: dxScore.i.score,
      total: dxScore.total,
      h: dxScore.h.score,
      source: `Ngày tham chiếu ${formatDate(dxScore.referenceDate)}, tính lúc ${formatDateTime(dxScore.computedAt)}, công thức v1`,
    });
  }
  if (latestSnapshot) {
    dxPeriodRows.push({
      label: "Snapshot gần nhất đã lưu",
      p: latestSnapshot.p.score,
      d: latestSnapshot.d.score,
      i: latestSnapshot.i.score,
      total: latestSnapshot.total,
      h: latestSnapshot.h.score,
      source: `Snapshot ${latestSnapshot.id}, ngày tham chiếu ${formatDate(latestSnapshot.referenceDate)}, tính lúc ${formatDateTime(latestSnapshot.computedAt)}`,
    });
  }

  const dxPeriodColumns: TableColumn<DxPeriodRow>[] = [
    { key: "label", header: "Giai đoạn", render: (row) => <span className="font-medium text-gray-900">{row.label}</span>, cellClassName: "w-[199px]" },
    { key: "p", header: "P / 30", render: (row) => String(row.p), cellClassName: "w-[139px]" },
    { key: "d", header: "D / 30", render: (row) => String(row.d), cellClassName: "w-[139px]" },
    { key: "i", header: "I / 30", render: (row) => String(row.i), cellClassName: "w-[139px]" },
    { key: "total", header: "Tổng / 100", render: (row) => String(row.total), cellClassName: "w-[139px]" },
    { key: "h", header: "H / 100", render: (row) => String(row.h), cellClassName: "w-[139px]" },
    { key: "source", header: "Nguồn và thời điểm đóng băng", render: (row) => row.source, cellClassName: "w-[258px] !whitespace-normal" },
  ];

  const dxLogRows: DxLogRow[] = [];
  if (dxScore) {
    const time = formatDateTime(dxScore.computedAt);
    dxLogRows.push(
      { id: "P1", metric: "P - Đơn đi tròn luồng", value: ratioValue(dxScore.p.closedWithoutDetour), source: dxScore.p.closedWithoutDetour.note, time },
      { id: "P2", metric: "P - Chặn chuyển trái phép", value: ratioValue(dxScore.p.illegalBlocked), source: dxScore.p.illegalBlocked.note, time },
      { id: "D1", metric: "D - Chỉ số ghi nguồn", value: ratioValue(dxScore.d.attributedIndicators), source: dxScore.d.attributedIndicators.note, time },
      { id: "D2", metric: "D - Phả hệ đầy đủ", value: ratioValue(dxScore.d.fullLineage), source: dxScore.d.fullLineage.note, time },
      { id: "I", metric: "I - Đề xuất đúng", value: ratioValue(dxScore.i.correctApproved), source: dxScore.i.correctApproved.note, time },
      { id: "H-tay", metric: "H - Bước làm tay", value: ratioValue(dxScore.h.manualStepRatio), source: dxScore.h.manualStepRatio.note, time },
      { id: "H-ngoai-le", metric: "H - Tỷ lệ ngoại lệ", value: ratioValue(dxScore.h.exceptionRatio), source: dxScore.h.exceptionRatio.note, time },
    );
    for (const wait of dxScore.h.avgApprovalWaitMsByType) {
      dxLogRows.push({
        id: `H-cho-${wait.type}`,
        metric: `H - Chờ duyệt (${wait.type})`,
        value: formatDuration(wait.avgMs),
        source: `${wait.n} quyết định`,
        time,
      });
    }
    for (const entry of dxScore.h.decisionsPerPersonPerDayByRole) {
      dxLogRows.push({
        id: `H-qd-${entry.role}-${entry.date}`,
        metric: `H - Quyết định (${entry.role})`,
        value: `${entry.count} quyết định`,
        source: `Ngày ${formatDate(entry.date)}`,
        time,
      });
    }
  }

  const dxLogColumns: TableColumn<DxLogRow>[] = [
    { key: "id", header: "Mã log", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[139px]" },
    { key: "metric", header: "Chỉ số", render: (row) => row.metric, cellClassName: "w-[199px]" },
    { key: "value", header: "Giá trị", render: (row) => row.value, cellClassName: "w-[139px]" },
    { key: "source", header: "Nguồn log", render: (row) => row.source, cellClassName: "w-[278px] !whitespace-normal" },
    { key: "time", header: "Thời gian", render: (row) => row.time, cellClassName: "w-[159px]" },
    { key: "check", header: "Kiểm tra", render: () => "Xem log gốc", cellClassName: "w-[239px]" },
  ];

  // Tiêu đề, cột và dòng trống của bảng ở 4 tab dùng bảng dự báo.
  const tabTable =
    activeTab === "Thực tế"
      ? { title: "Doanh số thật - 7 ngày qua so với 7 ngày trước", columns: actualColumns, emptyText: "Không có dữ liệu dự báo." }
      : activeTab === "Dự báo"
        ? { title: "Dự báo nhu cầu theo SKU và kênh (7 ngày tới)", columns: forecastColumns, emptyText: undefined }
        : activeTab === "Kênh bán"
          ? { title: "Dự báo nhu cầu theo kênh (7 ngày tới)", columns: forecastColumns, emptyText: "Không có dữ liệu theo kênh." }
          : activeTab === "Tồn kho"
            ? { title: "SKU sắp hết hàng - dưới 7 ngày tồn kho", columns: lowStockColumns, emptyText: "Không có SKU sắp hết hàng." }
            : null;

  const hWaitEmpty =
    dxScore !== null &&
    dxScore.h.avgApprovalWaitMsByType.length === 0 &&
    dxScore.h.decisionsPerPersonPerDayByRole.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">BI và DX-Score</h1>
      {referenceDate !== null && (
        <p className="-mt-2 text-sm text-gray-500">
          Ngày tham chiếu: {formatDate(referenceDate)}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Nhóm BI">
        {BI_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => {
              setActiveTab(tab);
              setPage(1);
            }}
            className={`flex h-9 items-center justify-center rounded-md px-4 text-sm ${
              activeTab === tab
                ? "bg-red-700 font-medium text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Tổng quan" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-lg border bg-white p-5">
              <p className="text-sm font-medium text-gray-500">SKU đủ lịch sử</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {forecastError !== null
                  ? "–"
                  : `${skuWithHistory} / ${aggregateRows.length}`}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-5">
              <p className="text-sm font-medium text-gray-500">Bất thường đang mở</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {biError !== null ? "–" : anomalies.length}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-5">
              <p className="text-sm font-medium text-gray-500">Đề xuất chờ duyệt</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {biError !== null ? "–" : pendingRecommendations}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-5">
              <p className="text-sm font-medium text-gray-500">Phản hồi đã ghi</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {biError !== null ? "–" : feedback.length}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-5">
              <p className="text-sm font-medium text-gray-500">DX-Score</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {dxScore === null ? "–" : `${dxScore.total} / 100`}
              </p>
            </div>
          </div>

          <ColdDataSourceSection
            summary={archiveSummary}
            analytics={coldAnalytics}
            error={coldError}
          />

          <LineageSection lineage={lineage} error={lineageError} />

          <div className="flex flex-col gap-3 xl:flex-row">
            <section className="min-w-0 flex-1 rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Dự báo tuần tới - nhóm SKU đủ lịch sử</h2>
              {forecastError !== null ? (
                <SectionError error={forecastError} />
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {miniRows.map((row) => (
                    <div key={`${row.sku}-${row.channelId ?? "all"}`} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-[13px] font-medium text-gray-900">
                          {row.sku} - {row.channelId === null ? "Tất cả" : (channelNameById[row.channelId] ?? row.channelId)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {row.forecast7d} đơn (tuần trước {row.salesLast7d}, {formatChange(row.change)})
                        </p>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className="h-2 rounded-full bg-red-700" style={{ width: `${row.barPercent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border bg-white p-4 xl:w-[468px] xl:shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Những việc cần làm</h2>
              <div className="mt-3 flex flex-col gap-3">
                {BI_TODOS.map((todo) => (
                  <div key={todo.rank} className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-700 text-xs font-bold text-white">
                      {todo.rank}
                    </span>
                    <p className="flex-1 text-[13px] text-gray-700">{todo.text}</p>
                    <Link
                      href={todo.href}
                      className="flex h-8 shrink-0 items-center justify-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white"
                    >
                      {todo.button}
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {tabTable !== null && (
        <section className="overflow-x-auto rounded-lg border bg-white">
          <div className="flex h-11 items-center px-4">
            <h2 className="text-sm font-semibold text-gray-900">{tabTable.title}</h2>
          </div>
          {forecastError !== null ? (
            <SectionError error={forecastError} />
          ) : (
            <>
              <Table columns={tabTable.columns} rows={pageRows} rowKey={(row) => `${row.sku}-${row.channelId ?? "all"}`} bare emptyText={tabTable.emptyText} />
              {tabRows.length > 0 && (
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} range={range} />
              )}
            </>
          )}
        </section>
      )}

      {activeTab === "Cảnh báo" && (
        <section className="overflow-x-auto rounded-lg border bg-white">
          <div className="flex h-11 items-center px-4">
            <h2 className="text-sm font-semibold text-gray-900">Phát hiện bất thường và đề xuất (kèm giải thích, cần duyệt)</h2>
          </div>
          {biError !== null ? (
            <SectionError error={biError} />
          ) : (
            <>
              {actionError !== null && (
                <p className="border-b px-4 py-3 text-sm text-red-700">{actionError}</p>
              )}
              <Table
                columns={anomalyColumns}
                rows={recommendations}
                rowKey={(row) => row.id}
                bare
                emptyText="Không có bất thường đang mở"
              />
            </>
          )}
        </section>
      )}

      {activeTab === "Hoạt động" && (
        <>
          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-sm font-semibold text-gray-900">DX-Score radar HPDI - đo từ log vận hành thật</h2>
              {dxScore !== null && (
                <p className="shrink-0 text-sm font-semibold text-red-700">
                  {dxScore.total} / 100 - H {dxScore.h.score}/100
                </p>
              )}
            </div>
            {dxError !== null ? (
              <SectionError error={dxError} />
            ) : dxScore === null ? (
              <p className="mt-3 text-sm text-gray-700">Chưa có điểm DX-Score.</p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-3">
                  {dxAxes.map((axis) => (
                    <div key={axis.key} className="flex items-center gap-3">
                      <p className="w-6 shrink-0 text-[13px] font-semibold text-gray-900">{axis.key}</p>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-2.5 rounded-full bg-red-700"
                          style={{ width: `${(axis.value / axis.max) * 100}%` }}
                        />
                      </div>
                      <p className="w-[70px] shrink-0 text-[13px] font-semibold text-gray-900">
                        {axis.value} / {axis.max}
                      </p>
                    </div>
                  ))}
                </div>
                {dxNotes.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {dxNotes.map((note) => (
                      <li key={note} className="text-xs text-gray-500">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="overflow-x-auto rounded-lg border bg-white">
            {dxError !== null ? (
              <SectionError error={dxError} />
            ) : (
              <Table columns={dxPeriodColumns} rows={dxPeriodRows} rowKey={(row) => row.label} bare />
            )}
          </section>

          <section className="overflow-x-auto rounded-lg border bg-white">
            <div className="flex h-11 items-center px-4">
              <h2 className="text-sm font-semibold text-gray-900">Log gốc bấm xuống được (mỗi điểm số đều có log)</h2>
            </div>
            {dxError !== null ? (
              <SectionError error={dxError} />
            ) : (
              <>
                <Table columns={dxLogColumns} rows={dxLogRows} rowKey={(row) => row.id} bare />
                {hWaitEmpty && (
                  <p className="border-t px-4 py-3 text-xs text-gray-500">
                    Chưa có phê duyệt nào trong log nên chưa đo được thời gian chờ
                    duyệt và số quyết định theo người/ngày.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="overflow-x-auto rounded-lg border bg-white">
            <div className="flex h-11 items-center px-4">
              <h2 className="text-sm font-semibold text-gray-900">Phản hồi đã ghi</h2>
            </div>
            {biError !== null ? (
              <SectionError error={biError} />
            ) : (
              <Table columns={feedbackColumns} rows={feedback} rowKey={(item) => item.id} bare emptyText="Chưa có phản hồi nào." />
            )}
          </section>
        </>
      )}
    </div>
  );
}
