"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, RefreshCw, Archive } from "lucide-react";
import { Pagination, type PaginationRange } from "@/components/ui/Pagination";
import type {
  ApiArchiveRun,
  ApiArchiveSummary,
  ApiColdAnalytics,
  ApiColdGroup,
} from "./cold-data-types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatVnd(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)} ₫`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function GroupTable({
  title,
  rows,
  keyLabel,
  formatKey,
  page,
  totalPages,
  onPageChange,
  range,
}: {
  title: string;
  rows: ApiColdGroup[];
  keyLabel: string;
  formatKey?: (value: string) => string;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  range?: PaginationRange;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">{keyLabel}</th>
              <th className="px-4 py-2 text-right">Số đơn</th>
              <th className="px-4 py-2 text-right">Doanh thu</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-2 text-gray-700">
                  {formatKey ? formatKey(row.key) : row.key}
                </td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {row.count}
                </td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {formatVnd(row.revenue)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  Chưa có dữ liệu.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {page !== undefined &&
      totalPages !== undefined &&
      onPageChange !== undefined &&
      range !== undefined ? (
        <div className="border-t">
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} range={range} />
        </div>
      ) : null}
    </div>
  );
}

const PAGE_SIZE = 5;

export default function ColdDataClient({
  initialSummary,
  initialRuns,
  initialAnalytics,
  canArchive,
}: {
  initialSummary: ApiArchiveSummary;
  initialRuns: ApiArchiveRun[];
  initialAnalytics: ApiColdAnalytics;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [runs, setRuns] = useState(initialRuns);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [olderThanDays, setOlderThanDays] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [byDayPage, setByDayPage] = useState(1);

  // Lịch sử archive tăng theo mỗi run, bảng theo ngày tăng theo từng ngày
  // nên phân trang 5 dòng/trang; theo trạng thái và theo kênh bị giới hạn
  // bởi số trạng thái/kênh cố định nên giữ nguyên không phân trang.
  const runsTotalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const runsSafePage = Math.min(runsPage, runsTotalPages);
  const runsPaged = runs.slice((runsSafePage - 1) * PAGE_SIZE, runsSafePage * PAGE_SIZE);
  const runsRange: PaginationRange =
    runs.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (runsSafePage - 1) * PAGE_SIZE + 1,
          end: Math.min(runsSafePage * PAGE_SIZE, runs.length),
          total: runs.length,
        };
  const byDayTotalPages = Math.max(1, Math.ceil(analytics.byDay.length / PAGE_SIZE));
  const byDaySafePage = Math.min(byDayPage, byDayTotalPages);
  const byDayPaged = analytics.byDay.slice(
    (byDaySafePage - 1) * PAGE_SIZE,
    byDaySafePage * PAGE_SIZE,
  );
  const byDayRange: PaginationRange =
    analytics.byDay.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (byDaySafePage - 1) * PAGE_SIZE + 1,
          end: Math.min(byDaySafePage * PAGE_SIZE, analytics.byDay.length),
          total: analytics.byDay.length,
        };

  useEffect(() => {
    setSummary(initialSummary);
    setRuns(initialRuns);
    setAnalytics(initialAnalytics);
  }, [initialSummary, initialRuns, initialAnalytics]);

  async function runArchive(): Promise<void> {
    const days = Number(olderThanDays);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      setError("Số ngày phải là số nguyên trong khoảng 0..3650.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/archive/orders/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ olderThanDays: days }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          data && typeof data === "object" && "message" in data
            ? String((data as { message?: unknown }).message)
            : `API trả về ${response.status}.`;
        setError(message);
        return;
      }
      const result = data as { archived?: number; run?: ApiArchiveRun | null };
      if (result.archived === 0 || !result.run) {
        setNotice("Không có đơn mới để archive.");
      } else {
        setNotice(
          `Đã archive ${result.archived} đơn vào ${result.run.objectKey ?? "Parquet"}.`,
        );
      }
      router.refresh();
    } catch {
      setError("Không gọi được API archive.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Kho dữ liệu lạnh
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Đơn đã đóng được export ra Parquet trên SeaweedFS. Báo cáo lịch sử
            đọc từ cold data, không truy vấn OLTP.
          </p>
        </div>
        {canArchive ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Tuổi tối thiểu (ngày)
              <input
                type="number"
                min={0}
                max={3650}
                value={olderThanDays}
                onChange={(event) => setOlderThanDays(event.target.value)}
                className="h-10 w-28 rounded-md border border-gray-300 px-3 text-sm text-gray-900"
              />
            </label>
            <button
              type="button"
              onClick={runArchive}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              {loading ? "Đang archive..." : "Chạy archive"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Chỉ quản lý/quản trị viên được chạy archive.
          </p>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Đơn trong OLTP</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {summary.ordersInOltp}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Đơn đã archive</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">
            {summary.archivedOrders}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Số run</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {summary.runCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Dung lượng cold</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {formatBytes(summary.coldBytes)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Cold rows đọc được</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {analytics.rows}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Doanh thu cold</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {formatVnd(analytics.totalRevenue)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Parquet runs đã đọc</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {analytics.runs}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Database size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            Lịch sử archive
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Run</th>
                <th className="px-4 py-2">Cutoff</th>
                <th className="px-4 py-2 text-right">Số đơn</th>
                <th className="px-4 py-2 text-right">Dung lượng</th>
                <th className="px-4 py-2">Trạng thái</th>
                <th className="px-4 py-2">Thời điểm</th>
                <th className="px-4 py-2">Object key</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runsPaged.map((run) => (
                <tr key={run.id} className="align-top">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {run.id}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {formatDateTime(run.cutoffAt)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {run.rowCount}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {formatBytes(run.bytes)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        run.status === "completed"
                          ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                          : "rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                      }
                    >
                      {run.status === "completed" ? "Completed" : "Failed"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {formatDateTime(run.startedAt)}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-2 text-xs text-gray-500">
                    <span title={run.objectKey ?? run.error ?? ""}>
                      {run.objectKey ?? run.error ?? "--"}
                    </span>
                  </td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    Chưa có run archive. Bấm “Chạy archive” để tạo Parquet đầu
                    tiên.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t">
          <Pagination page={runsSafePage} totalPages={runsTotalPages} onPageChange={setRunsPage} range={runsRange} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <GroupTable title="Theo trạng thái" rows={analytics.byState} keyLabel="Trạng thái" />
        <GroupTable title="Theo kênh" rows={analytics.byChannel} keyLabel="Kênh" />
        <GroupTable
          title="Theo ngày"
          rows={byDayPaged}
          keyLabel="Ngày"
          formatKey={formatDay}
          page={byDaySafePage}
          totalPages={byDayTotalPages}
          onPageChange={setByDayPage}
          range={byDayRange}
        />
      </div>

      <p className="flex items-start gap-2 text-xs text-gray-500">
        <Archive size={14} className="mt-0.5 shrink-0" />
        Cold data là bản Parquet trên SeaweedFS, tách khỏi OLTP. Archive không
        xoá đơn gốc để giữ workflow/audit; manifest ngăn export trùng. Dữ liệu
        Parquet không chứa phone/address/tên khách hàng.
      </p>
    </div>
  );
}
